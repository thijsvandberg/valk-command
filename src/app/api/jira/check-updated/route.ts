import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { logger } from "@/lib/logger";

/**
 * GET /api/jira/check-updated?key=VPL-123
 *
 * Lightweight freshness check: fetches only the `updated` timestamp from Jira
 * for a single issue and compares it with the locally stored jiraUpdatedAt.
 * Returns whether the local data is stale without fetching full issue data.
 *
 * If the ticket no longer exists in Jira (404), marks it as removed locally
 * and returns { removed: true }.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key query parameter is required" }, { status: 400 });
  }

  if (!jiraClient.isLive) {
    return NextResponse.json({ stale: false, reason: "jira-not-configured" });
  }

  try {
    const local = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    });

    const localUpdated = local?.jiraUpdatedAt ?? null;

    const issue = await jiraClient.getIssue(key);
    const remoteUpdated = issue.fields.updated;

    const stale = !localUpdated || localUpdated !== remoteUpdated;

    return NextResponse.json({
      stale,
      localUpdated,
      remoteUpdated,
      key,
    });
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 404) {
      await db.update(ticket)
        .set({ removedFromJiraAt: new Date().toISOString() })
        .where(eq(ticket.jiraKey, key));
      return NextResponse.json({ stale: false, removed: true, key });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to check issue freshness", message);
    return NextResponse.json({ error: "Failed to check issue freshness" }, { status: 502 });
  }
}
