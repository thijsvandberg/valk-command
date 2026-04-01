import { NextResponse } from "next/server";
import { db } from "@/db";
import { jiraClient } from "@/lib/jira-client";

/**
 * GET /api/jira/health
 *
 * Checks if Jira is reachable and credentials are valid.
 * Returns cached data availability when Jira is unreachable.
 */
export async function GET() {
  const live = jiraClient.isLive;

  if (!live) {
    const cached = await db.query.appSetting.findFirst({
      where: (row, { eq }) => eq(row.key, "jira_sprints"),
    });
    return NextResponse.json({
      ok: false,
      live: false,
      error: "Jira credentials not configured",
      cachedDataAvailable: Boolean(cached),
    });
  }

  try {
    const result = await jiraClient.checkHealth();
    return NextResponse.json({ ok: true, live: true, user: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const cached = await db.query.appSetting.findFirst({
      where: (row, { eq }) => eq(row.key, "jira_sprints"),
    });
    return NextResponse.json({
      ok: false,
      live: false,
      error: message,
      cachedDataAvailable: Boolean(cached),
    });
  }
}
