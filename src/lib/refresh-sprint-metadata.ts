import { db } from "@/db";
import { appSetting, activityLog } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import type { JiraSprint } from "@/lib/jira-client";
import { upsertSetting } from "@/lib/upsert-setting";
import { cacheSprintName } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const SPRINT_SYNC_KEY = "jira_sprint_sync_watermark";
const SPRINT_COOLDOWN_MS = 5 * 60 * 1000;

interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
}

function sprintToStored(s: JiraSprint): StoredSprint {
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
 * Refreshes sprint metadata (state, goal, dates) if the 5-minute cooldown
 * has elapsed. Returns true if a refresh was performed.
 */
export async function refreshSprintMetadata(signal?: AbortSignal): Promise<boolean> {
  const lastRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, SPRINT_SYNC_KEY),
  });

  if (lastRow) {
    const elapsed = Date.now() - new Date(lastRow.value).getTime();
    if (elapsed < SPRINT_COOLDOWN_MS) return false;
  }

  const sprints = await jiraClient.getSprintsLightweight(signal);

  const existingRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, "jira_sprints"),
  });
  let cached: StoredSprint[] = [];
  if (existingRow) {
    try { cached = JSON.parse(existingRow.value); } catch { /* ignore */ }
  }

  // Detect state transitions before merging
  const oldMap = new Map(cached.map((s) => [s.id, s]));
  for (const fresh of sprints) {
    const old = oldMap.get(fresh.id);
    if (old && old.state !== fresh.state) {
      logger.info("jira", `Sprint "${fresh.name}" state: ${old.state} -> ${fresh.state}`);
      await db.insert(activityLog).values({
        id: `sprint-transition-${fresh.id}-${Date.now()}`,
        type: "sprint-sync",
        scope: fresh.name,
        status: "success",
        summary: `Sprint "${fresh.name}" transitioned from ${old.state} to ${fresh.state}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }
  }

  // Same merge strategy as sync-sprints: remove cached entries matching
  // synced states or whose ID appears in fresh data
  const syncedStates = new Set(["active", "future"]);
  const freshIds = new Set(sprints.map((s) => s.id));
  const kept = cached.filter((s) => !syncedStates.has(s.state) && !freshIds.has(s.id));
  const merged = [...kept, ...sprints.map(sprintToStored)];

  await upsertSetting("jira_sprints", JSON.stringify(merged));
  await upsertSetting(SPRINT_SYNC_KEY, new Date().toISOString());

  // Keep the sprint-name cache (resolved by detail surfaces like the epic
  // children view) in step with renames. Ticket records only store sprint IDs,
  // so without this a rename stays invisible there until a child ticket is
  // re-synced individually.
  for (const s of sprints) cacheSprintName(String(s.id), s.name);

  cache.invalidate("/api/jira/sprints");
  return true;
}
