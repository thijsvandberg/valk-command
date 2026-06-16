import { db } from "@/db";
import { appSetting, missingSprint, sprintNameCache, ticket } from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import { jiraClient, JiraApiError, type JiraSprint } from "@/lib/jira-client";
import { cacheSprintName } from "@/lib/upsert-issue";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const SPRINTS_KEY = "jira_sprints";

// How long a 404'd ("missing") sprint id is suppressed from re-fetch (BRDG-351). Long
// enough to kill the per-request loop (the board polls ~every 10s), short enough that a
// recreated/reappearing sprint recovers within a day. Expiry re-probes exactly once.
const MISSING_SPRINT_TTL_MS = 24 * 60 * 60 * 1000;

// Outcome of a single sprint fetch, shared across dedup callers so the 404-vs-transient
// decision is made once per id.
type FetchOutcome =
  | { kind: "found"; sprint: JiraSprint }
  | { kind: "missing" } // definitive 404: sprint no longer exists in Jira
  | { kind: "error" }; // transient failure: leave the cached copy untouched

// In-flight fetches keyed by sprint id, so two overlapping backfills (e.g. a sync pass and a
// read-path trigger) never issue duplicate getSprint calls for the same id.
const inFlight = new Map<string, Promise<FetchOutcome>>();

function fetchSprintOutcome(id: string, signal?: AbortSignal): Promise<FetchOutcome> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const promise = (async (): Promise<FetchOutcome> => {
    try {
      const sprint = await jiraClient.getSprint(Number(id), signal);
      return { kind: "found", sprint };
    } catch (err) {
      if (err instanceof JiraApiError && err.status === 404) {
        return { kind: "missing" };
      }
      logger.warn("jira", `Could not backfill unknown sprint ${id}`, err instanceof Error ? err.message : String(err));
      return { kind: "error" };
    }
  })().finally(() => inFlight.delete(id));

  inFlight.set(id, promise);
  return promise;
}

// Read the negative cache, pruning any entry whose suppression window has lapsed (so an expired id
// is re-probed on the next pass and can recover). Returns the set of ids still suppressed.
function loadSuppressedSprintIds(): Set<string> {
  const rows = db.select().from(missingSprint).all();
  const suppressed = new Set<string>();
  const now = Date.now();
  for (const row of rows) {
    const missingAtMs = Date.parse(row.missingAt);
    if (Number.isNaN(missingAtMs) || now - missingAtMs >= MISSING_SPRINT_TTL_MS) {
      db.delete(missingSprint).where(eq(missingSprint.sprintId, row.sprintId)).run();
    } else {
      suppressed.add(row.sprintId);
    }
  }
  return suppressed;
}

// Strip a 404'd sprint id from every local store that would otherwise re-surface it in the UI or
// re-seed the backfill loop (BRDG-351). Strictly local: no Jira write. Clearing ticket.sprintName is
// what actually stops the loop, since scheduleSprintBackfill seeds candidates from distinct
// ticket.sprintName. Tickets are kept (valid closed issues); only their dead sprint reference is
// dropped. The id is recorded in the negative cache so even a lingering reference is suppressed.
function recordMissingSprint(id: string): void {
  const now = new Date(Date.now()).toISOString();
  db.insert(missingSprint)
    .values({ sprintId: id, missingAt: now })
    .onConflictDoUpdate({ target: missingSprint.sprintId, set: { missingAt: now } })
    .run();

  db.delete(sprintNameCache).where(eq(sprintNameCache.sprintId, id)).run();

  // Reconcile each ticket that still carries the dead id: blank sprintName when it IS the dead id,
  // strip the id from the sprintIds JSON array (a ticket may legitimately belong to other, live
  // sprints), then converge the ticketSprint bridge.
  const orphans = db
    .select({ jiraKey: ticket.jiraKey, sprintName: ticket.sprintName, sprintIds: ticket.sprintIds })
    .from(ticket)
    .all()
    .filter((t) => t.sprintName === id || hasSprintId(t.sprintIds, id));

  for (const orphan of orphans) {
    const remainingIds = parseSprintIds(orphan.sprintIds).filter((sid) => sid !== id);
    const nextSprintIds = orphan.sprintIds == null ? null : JSON.stringify(remainingIds);
    const nextSprintName = orphan.sprintName === id ? "" : orphan.sprintName;
    db.update(ticket)
      .set({ sprintName: nextSprintName, sprintIds: nextSprintIds })
      .where(eq(ticket.jiraKey, orphan.jiraKey))
      .run();
    syncTicketSprints(db, orphan.jiraKey, nextSprintIds ? remainingIds : null, nextSprintName);
  }
}

function parseSprintIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hasSprintId(raw: string | null, id: string): boolean {
  return parseSprintIds(raw).includes(id);
}

// A cached sprint needs no re-fetch only when its metadata is complete enough to render. A closed
// sprint must have an end date; if it does not, it is a partially-known entry worth re-fetching.
// Active/future/backlog entries are treated as complete (future sprints legitimately lack dates,
// and active ones are kept fresh by refreshSprintMetadata) to avoid re-fetch churn.
function isComplete(s: StoredSprint): boolean {
  if (s.state === "closed") return !!s.endDate;
  return true;
}

// Mirrors the StoredSprint shape written by /api/jira/sync-sprints so the cached
// list stays uniform regardless of which path populated it.
interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
}

function toStored(s: JiraSprint): StoredSprint {
  return {
    id: s.id,
    name: s.name,
    state: s.state,
    startDate: s.startDate ?? null,
    endDate: s.endDate ?? null,
    completeDate: s.completeDate ?? null,
    goal: s.goal ?? null,
  };
}

/**
 * Ensure each given sprint id exists in the cached sprint list (`jira_sprints`) with full
 * metadata. Any id that is missing, or cached but only partially known (a closed sprint without
 * an end date), is fetched from Jira and merged in, so a ticket that references such a sprint
 * surfaces with full metadata (state/dates/goal) instead of a bare name.
 *
 * A definitive 404 means the sprint was deleted in Jira: its entry is removed from both
 * `jira_sprints` and `sprintNameCache` so it disappears from Bridge and is not re-fetched on
 * every subsequent view (negative-cache via deletion).
 *
 * Best-effort and side-channel: a transient fetch failure for one sprint is logged and the cached
 * copy is left intact, so it never fails the surrounding request. Concurrent calls for the same
 * id share a single getSprint via an in-flight map. Returns how many sprints were newly fetched.
 * Backlog ("") and non-numeric ids are ignored.
 */
export async function ensureSprintsCached(sprintIds: Iterable<string>, signal?: AbortSignal): Promise<number> {
  const ids = [...new Set(sprintIds)].filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return 0;

  const existingRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, SPRINTS_KEY),
  });
  let cached: StoredSprint[] = [];
  if (existingRow) {
    try {
      cached = JSON.parse(existingRow.value);
    } catch {
      // ignore corrupt cache; treat as empty
    }
  }

  // Skip ids that are already cached with complete metadata, and ids in the negative cache whose
  // suppression window has not lapsed; everything else (missing or partially-known) is a candidate.
  const complete = new Set(cached.filter(isComplete).map((s) => String(s.id)));
  const suppressed = loadSuppressedSprintIds();
  const toFetch = ids.filter((id) => !complete.has(id) && !suppressed.has(id));
  if (toFetch.length === 0) return 0;

  const fetched: StoredSprint[] = [];
  const deleted: string[] = [];
  for (const id of toFetch) {
    const outcome = await fetchSprintOutcome(id, signal);
    if (outcome.kind === "found") {
      fetched.push(toStored(outcome.sprint));
      cacheSprintName(id, outcome.sprint.name);
      // A reappeared sprint sheds its known-missing record so it stays cached.
      db.delete(missingSprint).where(eq(missingSprint.sprintId, id)).run();
    } else if (outcome.kind === "missing") {
      deleted.push(id);
      recordMissingSprint(id);
    }
    // "error" (transient): leave the cached copy untouched.
  }
  if (fetched.length === 0 && deleted.length === 0) return 0;

  // Merge by id so a re-fetched partial entry replaces its stale copy instead of duplicating, and
  // 404'd sprints are dropped.
  const byId = new Map<string, StoredSprint>(cached.map((s) => [String(s.id), s]));
  for (const s of fetched) byId.set(String(s.id), s);
  for (const id of deleted) byId.delete(id);

  // Upsert (not insert-or-update by row presence) so two concurrent backfills can't collide on the
  // unique key. A lost update across different-id backfills is acceptable best-effort: the next
  // read re-triggers and converges.
  const payload = JSON.stringify([...byId.values()]);
  await db
    .insert(appSetting)
    .values({ key: SPRINTS_KEY, value: payload })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });
  // 404'd ids are scrubbed from sprintNameCache and orphaned tickets inside recordMissingSprint.
  cache.invalidate("/api/jira/sprints");

  return fetched.length;
}

/**
 * Resolve the set of sprint ids worth backfilling: every distinct id a ticket references, minus the
 * ids already cached with complete metadata (positive cache) and the ids suppressed by the negative
 * cache (BRDG-351). Reconciling the ticket-derived candidate source against both caches here is what
 * keeps a Jira-deleted sprint out of the fetch loop, since the raw candidate list never drops it.
 */
export async function getBackfillCandidateIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sprintId: ticket.sprintName })
    .from(ticket)
    .where(ne(ticket.sprintName, ""))
    .all();
  const ids = rows
    .map((r) => r.sprintId)
    .filter((id): id is string => !!id && /^\d+$/.test(id));
  if (ids.length === 0) return [];

  const existingRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, SPRINTS_KEY),
  });
  let cached: StoredSprint[] = [];
  if (existingRow) {
    try {
      cached = JSON.parse(existingRow.value);
    } catch {
      // ignore corrupt cache; treat as empty
    }
  }
  const complete = new Set(cached.filter(isComplete).map((s) => String(s.id)));
  const suppressed = loadSuppressedSprintIds();
  return ids.filter((id) => !complete.has(id) && !suppressed.has(id));
}
