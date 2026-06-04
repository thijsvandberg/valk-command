import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, type JiraSprint } from "@/lib/jira-client";
import { cacheSprintName } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const SPRINTS_KEY = "jira_sprints";

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
 * Ensure each given sprint id exists in the cached sprint list (`jira_sprints`).
 * Any id not already cached is fetched from Jira and merged in, so a ticket that
 * references a brand-new sprint surfaces with full metadata (state/dates/goal) on
 * the board instead of a bare numeric fallback.
 *
 * Best-effort and side-channel: a fetch failure for one sprint is logged and
 * skipped so it never fails the surrounding ticket sync. Returns how many sprints
 * were newly cached. Backlog ("") and non-numeric ids are ignored.
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

  const known = new Set(cached.map((s) => String(s.id)));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length === 0) return 0;

  const fetched: StoredSprint[] = [];
  for (const id of missing) {
    try {
      const sprint = await jiraClient.getSprint(Number(id), signal);
      fetched.push(toStored(sprint));
      cacheSprintName(id, sprint.name);
    } catch (err) {
      logger.warn("jira", `Could not backfill unknown sprint ${id}`, err instanceof Error ? err.message : String(err));
    }
  }
  if (fetched.length === 0) return 0;

  const payload = JSON.stringify([...cached, ...fetched]);
  if (existingRow) {
    await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, SPRINTS_KEY));
  } else {
    await db.insert(appSetting).values({ key: SPRINTS_KEY, value: payload });
  }
  cache.invalidate("/api/jira/sprints");

  return fetched.length;
}
