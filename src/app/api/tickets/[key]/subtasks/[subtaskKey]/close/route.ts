import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { validatePathParam } from "@/lib/api-validation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { ticketSubtask } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string; subtaskKey: string }> };

/**
 * POST /api/tickets/[key]/subtasks/[subtaskKey]/close
 *
 * Closes a single subtask by transitioning it to DONE. Unlike the bulk-close
 * route, there is no parent-DONE guard: this is used when finishing a sprint to
 * clear individual open subtasks one at a time.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key, subtaskKey } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;
  const invalidSub = validatePathParam(subtaskKey);
  if (invalidSub) return invalidSub;

  const sub = await db.query.ticketSubtask.findFirst({
    where: (s, { eq: eqFn, and: andFn }) =>
      andFn(eqFn(s.ticketKey, key), eqFn(s.subtaskKey, subtaskKey)),
  });

  if (!sub) {
    return errorResponse("Subtask not found", 404);
  }

  try {
    await jiraClient.transitionIssue(subtaskKey, "DONE");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("subtask-close", `Jira transition failed for ${subtaskKey}: ${message}`);
    return errorResponse("Jira update failed", 502);
  }

  await db.update(ticketSubtask)
    .set({ status: "DONE" })
    .where(and(eq(ticketSubtask.ticketKey, key), eq(ticketSubtask.subtaskKey, subtaskKey)));

  await syncJiraTimestamp(key);

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Closed subtask ${subtaskKey}`,
  });

  return NextResponse.json({ ok: true });
}
