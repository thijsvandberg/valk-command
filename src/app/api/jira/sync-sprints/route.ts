import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting, syncLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";

/**
 * POST /api/jira/sync-sprints
 *
 * Fetches the full sprint list from Jira (with pagination) and caches it in
 * app_setting as a JSON blob keyed by "jira_sprints".
 */
export async function POST() {
  const logId = `sync-sprints-${Date.now()}`;
  const startedAt = new Date().toISOString();

  await db.insert(syncLog).values({
    id: logId,
    type: "sprint-sync",
    scope: "sprints",
    status: "running",
    startedAt,
  });

  try {
    const sprints = await jiraClient.getSprints();

    const payload = JSON.stringify(
      sprints.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
      })),
    );

    const existing = await db.query.appSetting.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.key, "jira_sprints"),
    });

    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, "jira_sprints"));
    } else {
      await db.insert(appSetting).values({ key: "jira_sprints", value: payload });
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "success",
      summary: `${sprints.length} sprints synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({
      ok: true,
      count: sprints.length,
      live: jiraClient.isLive,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
