import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, ISSUE_FIELDS } from "@/lib/jira-client";
import { upsertIssue } from "@/lib/upsert-issue";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * POST /api/jira/sync-epics
 *
 * One-time sync: fetches all epics from Jira and upserts them into the local DB.
 * Called when the EpicPicker opens and the local epic list is empty or stale.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const logId = `sync-epics-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "ticket-sync",
    scope: "all-epics",
    status: "running",
    startedAt,
  });

  try {
    const jql = `project = ${env.JIRA_PROJECT_KEY} AND issuetype = Epic ORDER BY updated DESC`;
    const fields = ISSUE_FIELDS.split(",");
    const epics = await jiraClient.searchIssues(jql, fields, 200, request.signal);

    let upserted = 0;
    for (const epic of epics) {
      await upsertIssue(epic, "", request.signal);
      upserted++;
    }

    cache.invalidate("/api/epics");
    cache.invalidate(/^\/api\/tickets/);

    await db.update(activityLog).set({
      status: "success",
      summary: `Synced ${upserted} epics from Jira`,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ count: upserted });
  } catch (err) {
    logger.error("sync-epics", "POST failed", err);

    await db.update(activityLog).set({
      status: "failed",
      summary: `Epic sync failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ error: "Epic sync failed" }, { status: 500 });
  }
}
