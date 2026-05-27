import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";

/**
 * POST /api/jira/assign
 *
 * Assigns an issue to a user in Jira and updates the local DB.
 *
 * Body:
 *   issueKey:  string      - the ticket key
 *   accountId: string|null - Jira accountId, or null to unassign
 *   name:      string|null - display name (for local update)
 *   avatar:    string|null - avatar URL (for local update)
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  let body: { issueKey?: string; accountId?: string | null; name?: string | null; avatar?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { issueKey, accountId, name, avatar } = body;

  if (!issueKey || typeof issueKey !== "string") {
    return NextResponse.json({ ok: false, error: "issueKey is required" }, { status: 400 });
  }

  try {
    await jiraClient.assignIssue(issueKey, accountId ?? null);
    await syncJiraTimestamp(issueKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to assign issue", message);
    return NextResponse.json({ ok: false, error: "Failed to assign issue" }, { status: 500 });
  }

  // Update local assignee (DB stores just the display name string)
  await db
    .update(ticket)
    .set({ assignee: name ?? null })
    .where(eq(ticket.jiraKey, issueKey));

  cache.invalidate("/api/tickets");

  return NextResponse.json({ ok: true });
}
