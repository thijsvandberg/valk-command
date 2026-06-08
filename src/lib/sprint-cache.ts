import { db } from "@/db";
import { appSetting, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError, type JiraSprint } from "@/lib/jira-client";
import { cacheSprintName } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const SPRINTS_KEY = "jira_sprints";

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

  // Skip ids that are already cached with complete metadata; everything else (missing or
  // partially-known) is a fetch candidate.
  const complete = new Set(cached.filter(isComplete).map((s) => String(s.id)));
  const toFetch = ids.filter((id) => !complete.has(id));
  if (toFetch.length === 0) return 0;

  const fetched: StoredSprint[] = [];
  const deleted: string[] = [];
  for (const id of toFetch) {
    const outcome = await fetchSprintOutcome(id, signal);
    if (outcome.kind === "found") {
      fetched.push(toStored(outcome.sprint));
      cacheSprintName(id, outcome.sprint.name);
    } else if (outcome.kind === "missing") {
      deleted.push(id);
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
  for (const id of deleted) {
    db.delete(sprintNameCache).where(eq(sprintNameCache.sprintId, id)).run();
  }
  cache.invalidate("/api/jira/sprints");

  return fetched.length;
}
