import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { syncJiraTimestamps } from "@/lib/sync-jira-timestamp";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

/**
 * POST /api/jira/rank
 *
 * Re-ranks one or more issues relative to another issue in Jira, then updates
 * local jiraRank values to reflect the new ordering.
 *
 * Body:
 *   issueKeys:    string[]  - keys to move (in their relative order)
 *   rankBeforeKey?: string  - place above this key
 *   rankAfterKey?:  string  - place below this key
 *   sprintId:     string    - used to refresh all local ranks after the move
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const { issueKeys, rankBeforeKey, rankAfterKey, sprintId } = body as { issueKeys?: string[]; rankBeforeKey?: string; rankAfterKey?: string; sprintId?: string };

  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return errorResponse("issueKeys must be a non-empty array", 400);
  }
  if (!rankBeforeKey && !rankAfterKey) {
    return errorResponse("Provide rankBeforeKey or rankAfterKey", 400);
  }

  try {
    await jiraClient.rankIssues(issueKeys, rankBeforeKey, rankAfterKey);
    // One bulk fetch to refresh jiraUpdatedAt for the whole batch, instead of a
    // serialized getIssue per moved key (BRDG-408).
    await syncJiraTimestamps(issueKeys);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to rank issues", message);
    return errorResponse("Failed to rank issues", 500);
  }

  // Update local jiraRank values for the sprint.
  // Re-read all tickets in sprint order, compute new ranks based on the move.
  if (sprintId) {
    try {
      const sprintTickets = await db
        .select({ jiraKey: ticket.jiraKey, jiraRank: ticket.jiraRank })
        .from(ticket)
        .where(eq(ticket.sprintName, sprintId))
        .orderBy(asc(ticket.jiraRank));

      // Apply the same move locally that we sent to Jira
      const movedSet = new Set(issueKeys);
      const anchor = rankBeforeKey ?? rankAfterKey!;
      const anchorIdx = sprintTickets.findIndex((t) => t.jiraKey === anchor);
      if (anchorIdx !== -1) {
        const without = sprintTickets.filter((t) => !movedSet.has(t.jiraKey));
        const insertAt = rankBeforeKey
          ? without.findIndex((t) => t.jiraKey === anchor)
          : without.findIndex((t) => t.jiraKey === anchor) + 1;
        const movedTickets = issueKeys.map((k) => sprintTickets.find((t) => t.jiraKey === k)!).filter(Boolean);
        const reordered = [...without.slice(0, insertAt), ...movedTickets, ...without.slice(insertAt)];

        // One transaction so a mid-loop failure leaves no partial reindex (BRDG-376).
        db.transaction((tx) => {
          for (let i = 0; i < reordered.length; i++) {
            if (reordered[i].jiraRank !== i) {
              tx.update(ticket).set({ jiraRank: i }).where(eq(ticket.jiraKey, reordered[i].jiraKey)).run();
            }
          }
        });
      }
    } catch {
      // Non-fatal: ranks may be stale until next sync, but Jira was already updated
    }
  }

  cache.invalidate("/api/tickets");

  return NextResponse.json({ ok: true });
}
