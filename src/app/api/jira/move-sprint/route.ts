import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { inArray, eq, asc } from "drizzle-orm";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

/**
 * POST /api/jira/move-sprint
 *
 * Moves one or more issues to a different sprint in Jira, then updates
 * the local sprintName field so the UI reflects the change immediately.
 *
 * Body:
 *   issueKeys:     string[] - keys to move
 *   targetSprintId: string  - destination sprint ID
 *   position?:     "top" | "bottom" - rank the whole batch at one edge
 *   topKeys?:      string[] - split mode: this subset ranks to the top, the rest to
 *                  the bottom, in one move (BRDG-370 placement rule). Takes precedence
 *                  over `position` when present.
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const { issueKeys, targetSprintId, position, topKeys } = body as { issueKeys?: string[]; targetSprintId?: string; position?: string; topKeys?: string[] };

  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return errorResponse("issueKeys must be a non-empty array", 400);
  }
  if (!targetSprintId || typeof targetSprintId !== "string") {
    return errorResponse("targetSprintId is required", 400);
  }

  const isBacklog = targetSprintId === "__backlog__";

  // Decide which keys rank to the top vs. the bottom of the destination. Split
  // mode (`topKeys`) lets one move place an in-flight subset at the top and the
  // rest at the bottom (BRDG-370); otherwise `position` ranks the whole batch at
  // one edge ("Move to top/bottom", drag-between-rows). Ranking is filter-
  // independent: it spans the whole sprint/backlog regardless of any board filter.
  let topList: string[] = [];
  let bottomList: string[] = [];
  if (Array.isArray(topKeys)) {
    const topSet = new Set(topKeys);
    topList = issueKeys.filter((k) => topSet.has(k));
    bottomList = issueKeys.filter((k) => !topSet.has(k));
  } else if (position === "top") {
    topList = issueKeys;
  } else if (position === "bottom") {
    bottomList = issueKeys;
  }
  const shouldReorder = topList.length > 0 || bottomList.length > 0;

  if (!isBacklog) {
    const sprintIdNum = parseInt(targetSprintId, 10);
    if (isNaN(sprintIdNum)) {
      return errorResponse("targetSprintId must be a number", 400);
    }

    try {
      await jiraClient.moveToSprint(issueKeys, sprintIdNum);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("jira", "Failed to move issues", message);
      return errorResponse("Failed to move issues", 500);
    }
    // Best-effort: ranking is secondary to the move, so a failure here never fails
    // it. Rank the bottom subset first, then the top subset, so the top subset wins
    // the head of the list when both groups are present in one split move.
    if (bottomList.length > 0) {
      try {
        await jiraClient.rankToBottomOfSprint(bottomList, sprintIdNum);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to bottom of sprint", err instanceof Error ? err.message : String(err));
      }
    }
    if (topList.length > 0) {
      try {
        await jiraClient.rankToTopOfSprint(topList, sprintIdNum);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to top of sprint", err instanceof Error ? err.message : String(err));
      }
    }
  } else {
    try {
      await jiraClient.moveToBacklog(issueKeys);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("jira", "Failed to move issues to backlog", message);
      return errorResponse("Failed to move issues to backlog", 500);
    }
    if (bottomList.length > 0) {
      try {
        await jiraClient.rankToBottomOfBacklog(bottomList);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to bottom of backlog", err instanceof Error ? err.message : String(err));
      }
    }
    if (topList.length > 0) {
      try {
        await jiraClient.rankToTopOfBacklog(topList);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to top of backlog", err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Update local sprint assignment (empty string = backlog). A move from Bridge
  // targets a single sprint, so sprint_ids collapses to just that sprint and the
  // ticket leaves every other column immediately (re-derived on the next Jira sync).
  await db
    .update(ticket)
    .set({
      sprintName: isBacklog ? "" : targetSprintId,
      sprintIds: isBacklog ? null : JSON.stringify([targetSprintId]),
    })
    .where(inArray(ticket.jiraKey, issueKeys));

  // Mirror the move into the indexed bridge for the whole batch in one transaction.
  // A move targets a single sprint, so each ticket collapses to that one membership
  // (or none for a backlog move). Re-derived fully on the next Jira sync.
  db.transaction((tx) => {
    for (const key of issueKeys) {
      syncTicketSprints(tx, key, isBacklog ? null : [targetSprintId], isBacklog ? "" : targetSprintId);
    }
  });

  // Mirror the Jira rank-to-top/bottom locally so the board (which sorts by the
  // local jiraRank) shows the new order immediately. Without this the optimistic
  // move visibly snaps back on the next revalidation, because the move only set
  // sprintName above and jiraRank stays stale until the next full Jira sync. The
  // split (top subset + bottom subset) is reflected in one reindex pass: top rows,
  // then the untouched middle in its existing rank order, then bottom rows.
  if (shouldReorder) {
    try {
      const localSprintName = isBacklog ? "" : targetSprintId;
      const sprintTickets = await db
        .select({ jiraKey: ticket.jiraKey, jiraRank: ticket.jiraRank })
        .from(ticket)
        .where(eq(ticket.sprintName, localSprintName))
        .orderBy(asc(ticket.jiraRank));
      const movedSet = new Set([...topList, ...bottomList]);
      const middle = sprintTickets.filter((t) => !movedSet.has(t.jiraKey));
      const rowFor = (k: string) => sprintTickets.find((t) => t.jiraKey === k);
      const topRows = topList.map(rowFor).filter((t): t is { jiraKey: string; jiraRank: number | null } => Boolean(t));
      const bottomRows = bottomList.map(rowFor).filter((t): t is { jiraKey: string; jiraRank: number | null } => Boolean(t));
      const reordered = [...topRows, ...middle, ...bottomRows];
      // One transaction so a mid-loop failure leaves no partial reindex (BRDG-376).
      db.transaction((tx) => {
        for (let i = 0; i < reordered.length; i++) {
          if (reordered[i].jiraRank !== i) {
            tx.update(ticket).set({ jiraRank: i }).where(eq(ticket.jiraKey, reordered[i].jiraKey)).run();
          }
        }
      });
    } catch {
      // Non-fatal: ranks may be stale until the next sync, but Jira is already updated.
    }
  }

  cache.invalidate("/api/tickets");
  // The cached sprints payload embeds backlogCount, which moves to/from the backlog change.
  cache.invalidate("/api/jira/sprints");

  return NextResponse.json({ ok: true, movedCount: issueKeys.length });
}
