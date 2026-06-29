import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { normalizeStatus } from "@/lib/upsert-issue";
import { isValidJiraKey } from "@/lib/jql";
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

  if (!isValidJiraKey(key)) {
    return NextResponse.json({ error: "Invalid issue key" }, { status: 400 });
  }

  if (!jiraClient.isLive) {
    return NextResponse.json({ stale: false, reason: "jira-not-configured" });
  }

  try {
    const local = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    });

    const localUpdated = local?.jiraUpdatedAt ?? null;
    const localStatus = local?.status ?? null;

    const issue = await jiraClient.getIssue(key);
    const remoteUpdated = issue.fields.updated;
    const remoteStatus = issue.fields.status?.name
      ? normalizeStatus(issue.fields.status.name)
      : null;

    // Status can drift from Jira while the `updated` timestamp still matches (e.g. a
    // local status write Jira never accepted). Comparing status too means such drift
    // is still reported as stale and re-synced, instead of being masked by an equal
    // timestamp.
    const statusDrift =
      localStatus != null && remoteStatus != null && localStatus !== remoteStatus;
    const stale = !localUpdated || localUpdated !== remoteUpdated || statusDrift;

    return NextResponse.json({
      stale,
      localUpdated,
      remoteUpdated,
      localStatus,
      remoteStatus,
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
