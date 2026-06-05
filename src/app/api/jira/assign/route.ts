import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const { issueKey, accountId, name, avatar } = body as { issueKey?: string; accountId?: string | null; name?: string | null; avatar?: string | null };

  if (!issueKey || typeof issueKey !== "string") {
    return errorResponse("issueKey is required", 400);
  }

  // Assigning a person requires a real Jira accountId (the token has no
  // user-search scope, so the id must come from sync-captured data). Reject a
  // name without an id rather than silently unassigning. A null accountId AND
  // null name is an intentional unassign.
  if (name && !accountId) {
    return errorResponse(`Cannot assign "${name}" yet — no Jira account id on record. Re-sync this project and try again.`, 422);
  }

  try {
    await jiraClient.assignIssue(issueKey, accountId ?? null);
    await syncJiraTimestamp(issueKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to assign issue", message);
    return errorResponse("Failed to assign issue", 500);
  }

  // Update local assignee (DB stores just the display name string)
  await db
    .update(ticket)
    .set({ assignee: name ?? null })
    .where(eq(ticket.jiraKey, issueKey));

  cache.invalidate("/api/tickets");

  return NextResponse.json({ ok: true });
}
