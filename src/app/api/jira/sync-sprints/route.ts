import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";

interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
}

function sprintToStored(s: { id: number; name: string; state: string; startDate?: string; endDate?: string; completeDate?: string; goal?: string }): StoredSprint {
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
 * POST /api/jira/sync-sprints
 *
 * Fetches sprints from Jira and caches them in app_setting.
 * Accepts ?scope=sprints (default, syncs active+future) or ?scope=history (syncs closed).
 * Merges with existing cached data so syncing one scope does not wipe the other.
 */
export async function POST(request: NextRequest) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const scope = request.nextUrl.searchParams.get("scope") || "sprints";
  const states = scope === "history" ? ["closed"] : ["active", "future"];

  const logId = `sync-sprints-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "sprint-sync",
    scope,
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  // Abort after 3 minutes so the route itself marks the entry as failed,
  // rather than relying on the 5-minute stale cleanup in GET /api/activity-log.
  let timedOut = false;
  const routeTimeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 3 * 60 * 1000);

  try {
    const maxSprints = scope === "history" ? 30 : undefined;
    const sprints = await jiraClient.getSprints(states, controller.signal, maxSprints);

    // Load existing cached sprints to merge
    const existingRow = await db.query.appSetting.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.key, "jira_sprints"),
    });
    let cached: StoredSprint[] = [];
    if (existingRow) {
      try { cached = JSON.parse(existingRow.value); } catch { /* ignore corrupt cache */ }
    }

    // Remove cached entries that match the synced states OR whose ID appears
    // in fresh data (handles sprints that changed state, e.g. active -> closed)
    const syncedStates = new Set(states);
    const freshIds = new Set(sprints.map((s) => s.id));
    const kept = cached.filter((s) => !syncedStates.has(s.state) && !freshIds.has(s.id));
    const merged = [...kept, ...sprints.map(sprintToStored)];

    const payload = JSON.stringify(merged);

    if (existingRow) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, "jira_sprints"));
    } else {
      await db.insert(appSetting).values({ key: "jira_sprints", value: payload });
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${sprints.length} ${scope} synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    cache.invalidate("/api/jira/sprints");

    return NextResponse.json({
      ok: true,
      count: sprints.length,
      scope,
      live: jiraClient.isLive,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (timedOut) {
        const durationMs = Date.now() - new Date(startedAt).getTime();
        await db.update(activityLog).set({
          status: "failed",
          errorDetail: "Sync timed out (no response after 3 minutes)",
          durationMs,
          completedAt: new Date().toISOString(),
        }).where(eq(activityLog.id, logId));
        return errorResponse("Sync timed out", 504);
      }
      return errorResponse("Sync cancelled", 499);
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Sprint sync failed", message);
    return errorResponse("Sprint sync failed", 500);
  } finally {
    clearTimeout(routeTimeout);
    unregisterSync(logId);
  }
}
