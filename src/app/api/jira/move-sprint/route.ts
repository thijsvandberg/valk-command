import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { inArray } from "drizzle-orm";
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
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const { issueKeys, targetSprintId, position } = body as { issueKeys?: string[]; targetSprintId?: string; position?: string };

  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return errorResponse("issueKeys must be a non-empty array", 400);
  }
  if (!targetSprintId || typeof targetSprintId !== "string") {
    return errorResponse("targetSprintId is required", 400);
  }

  const isBacklog = targetSprintId === "__backlog__";
  // When dropped on a sprint/backlog zone (not between two rows), land at the very
  // top; the "Move to bottom" action lands at the very bottom. Both rank the issue
  // across the whole sprint/backlog, independent of any active board filter.
  const toTop = position === "top";
  const toBottom = position === "bottom";

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
    // Best-effort: ranking is secondary to the move, so a failure here never fails it.
    if (toTop) {
      try {
        await jiraClient.rankToTopOfSprint(issueKeys, sprintIdNum);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to top of sprint", err instanceof Error ? err.message : String(err));
      }
    } else if (toBottom) {
      try {
        await jiraClient.rankToBottomOfSprint(issueKeys, sprintIdNum);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to bottom of sprint", err instanceof Error ? err.message : String(err));
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
    if (toTop) {
      try {
        await jiraClient.rankToTopOfBacklog(issueKeys);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to top of backlog", err instanceof Error ? err.message : String(err));
      }
    } else if (toBottom) {
      try {
        await jiraClient.rankToBottomOfBacklog(issueKeys);
      } catch (err) {
        logger.warn("jira", "Failed to rank moved issues to bottom of backlog", err instanceof Error ? err.message : String(err));
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

  cache.invalidate("/api/tickets");
  // The cached sprints payload embeds backlogCount, which moves to/from the backlog change.
  cache.invalidate("/api/jira/sprints");

  return NextResponse.json({ ok: true, movedCount: issueKeys.length });
}
