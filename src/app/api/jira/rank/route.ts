import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

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
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  let body: { issueKeys?: string[]; rankBeforeKey?: string; rankAfterKey?: string; sprintId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { issueKeys, rankBeforeKey, rankAfterKey, sprintId } = body;

  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return NextResponse.json({ ok: false, error: "issueKeys must be a non-empty array" }, { status: 400 });
  }
  if (!rankBeforeKey && !rankAfterKey) {
    return NextResponse.json({ ok: false, error: "Provide rankBeforeKey or rankAfterKey" }, { status: 400 });
  }

  try {
    await jiraClient.rankIssues(issueKeys, rankBeforeKey, rankAfterKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to rank issues", message);
    return NextResponse.json({ ok: false, error: "Failed to rank issues" }, { status: 500 });
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

        for (let i = 0; i < reordered.length; i++) {
          if (reordered[i].jiraRank !== i) {
            await db.update(ticket).set({ jiraRank: i }).where(eq(ticket.jiraKey, reordered[i].jiraKey));
          }
        }
      }
    } catch {
      // Non-fatal: ranks may be stale until next sync, but Jira was already updated
    }
  }

  cache.invalidate("/api/tickets");

  return NextResponse.json({ ok: true });
}
