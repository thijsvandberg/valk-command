import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerIndependentTask } from "@/lib/task-registry";

const LAST_RUN_KEY = "pipeline_sync:last_run";
const LAST_RESULT_KEY = "pipeline_sync:last_result";
const INTERVAL_MS = 5 * 60 * 1000;

// Auto-register so System Tasks admin discovers this task
registerIndependentTask({
  name: "pipeline-sync",
  label: "Bitbucket Pipeline Sync",
  intervalMs: INTERVAL_MS,
  lastRunKey: LAST_RUN_KEY,
  lastResultKey: LAST_RESULT_KEY,
});

// Prevent concurrent execution
let running = false;

/**
 * POST /api/pipelines/tick
 *
 * Independent lazy-cron for pipeline sync. Runs separately from the
 * Jira scheduler tick to avoid blocking. Called by the frontend on
 * app load and periodically.
 */
export async function POST() {
  if (running) {
    return NextResponse.json({ skipped: true, reason: "already running" });
  }

  // Check if interval has elapsed
  const lastRunRow = db
    .select()
    .from(appSetting)
    .where(eq(appSetting.key, LAST_RUN_KEY))
    .get();

  const lastRunAt = lastRunRow ? new Date(lastRunRow.value).getTime() : 0;
  const elapsed = Date.now() - lastRunAt;

  if (elapsed < INTERVAL_MS) {
    return NextResponse.json({
      skipped: true,
      reason: "not due",
      nextInMs: INTERVAL_MS - elapsed,
    });
  }

  running = true;
  const now = new Date().toISOString();

  try {
    // Update last_run timestamp before running (prevents duplicate runs)
    if (lastRunRow) {
      db.update(appSetting).set({ value: now }).where(eq(appSetting.key, LAST_RUN_KEY)).run();
    } else {
      db.insert(appSetting).values({ key: LAST_RUN_KEY, value: now }).run();
    }

    // Import and run sync directly (no HTTP self-call)
    // Same pattern as Jira: sync one batch, if remaining > 0, repeat (max 5 rounds)
    const { syncPipelines } = await import("@/lib/pipeline-sync");
    let result = await syncPipelines();
    let rounds = 1;

    while (result.remaining > 0 && rounds < 5) {
      const more = await syncPipelines();
      result = {
        newRuns: result.newRuns + more.newRuns,
        updatedRuns: result.updatedRuns + more.updatedRuns,
        stateChanges: result.stateChanges + more.stateChanges,
        remaining: more.remaining,
      };
      rounds++;
    }

    // Store result
    const resultValue = JSON.stringify(result);
    const existingResult = db.select().from(appSetting).where(eq(appSetting.key, LAST_RESULT_KEY)).get();
    if (existingResult) {
      db.update(appSetting).set({ value: resultValue }).where(eq(appSetting.key, LAST_RESULT_KEY)).run();
    } else {
      db.insert(appSetting).values({ key: LAST_RESULT_KEY, value: resultValue }).run();
    }

    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    console.error("[pipeline-tick] sync failed:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    running = false;
  }
}

