import { NextResponse } from "next/server";
import { db } from "@/db";
import { jiraClient } from "@/lib/jira-client";

/**
 * GET /api/jira/check-updated?key=VPL-123
 *
 * Lightweight freshness check: fetches only the `updated` timestamp from Jira
 * for a single issue and compares it with the locally stored jiraUpdatedAt.
 * Returns whether the local data is stale without fetching full issue data.
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
      where: (row, { eq }) => eq(row.jiraKey, key),
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
