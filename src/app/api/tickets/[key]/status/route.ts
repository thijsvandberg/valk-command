import { NextResponse, after } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket, ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { applyRateLimit } from "@/lib/rate-limiter";
import type { JiraStatus } from "@/types/ticket";
import { emitTicketEvent, originFromRequest } from "@/lib/ticket-events";
import { maybeAutoGenerateTestDoc } from "@/lib/test-doc-background";

type RouteContext = { params: Promise<{ key: string }> };

const VALID_STATUSES: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

/**
 * A rejection is Jira reachable but refusing the transition: a 4xx
 * (validation/permission/conflict) or no matching transition offered at all
 * (transitionIssue throws "No available transition ..." — e.g. Done blocked while
 * subtasks are open). This is distinct from Jira being unreachable (5xx / network /
 * not configured), which we still apply locally as before.
 */
function isTransitionRejection(err: unknown): boolean {
  if (err instanceof JiraApiError) return err.status >= 400 && err.status < 500;
  if (err instanceof Error && err.message.startsWith("No available transition")) return true;
  return false;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { status?: string };

  const status = body.status as JiraStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return errorResponse(`status must be one of: ${VALID_STATUSES.join(", ")}`, 400);
  }

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!existing) {
    return errorResponse("Ticket not found", 404);
  }

  let jiraError: string | undefined;
  let rejected = false;
  try {
    await jiraClient.transitionIssue(key, status);
    await syncJiraTimestamp(key);
  } catch (err) {
    jiraError = err instanceof Error ? err.message : String(err);
    rejected = isTransitionRejection(err);
    logger.warn(
      "ticket-status",
      `Jira transition failed for ${key} (${rejected ? "rejected, not applying locally" : "updating locally anyway"}): ${jiraError}`,
    );
  }

  // Jira refused the transition (e.g. Done blocked by open subtasks): Jira will never
  // reflect this status, so applying it locally would strand a wrong status that no
  // sync can reconcile (jira_updated_at still matches Jira). Refuse instead; the
  // caller reverts its optimistic edit and surfaces the error.
  if (rejected) {
    await logActivity({
      type: "metadata-update",
      scope: key,
      status: "failed",
      summary: `Jira rejected status change to ${status}`,
      errorDetail: jiraError,
    });
    return errorResponse(`Jira rejected the transition to ${status}`, 409);
  }

  await db.update(ticket).set({ status }).where(eq(ticket.jiraKey, key));

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // A subtask's status is shown inside its parent ticket detail, whose response is cached
  // under the parent key. Drop that cache so the next read reflects the new status rather
  // than serving the stale embedded subtask.
  const parents = await db
    .select({ parentKey: ticketSubtask.ticketKey })
    .from(ticketSubtask)
    .where(eq(ticketSubtask.subtaskKey, key));
  for (const { parentKey } of parents) {
    cache.invalidate(`/api/tickets/${parentKey}`);
  }

  // The child's status is also shown in its epic's children table (embedded in the
  // epic's cached detail) and aggregated in the epics progress view.
  if (existing.epicKey) {
    cache.invalidate(`/api/tickets/${existing.epicKey}`);
  }
  cache.invalidate("/api/epics/progress");

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Changed status to ${status}${jiraError ? " (Bridge only — Jira transition unavailable)" : ""}`,
  });

  if (existing.status !== status) {
    emitTicketEvent({ type: "ticket:changed", ticketKey: key, kinds: ["status"], origin: originFromRequest(request) });
  }

  // BRDG-471: a Bridge-origin move into Test or Done arms the auto-test-doc trigger.
  // Placed past the `rejected` return so a Jira-refused transition never
  // auto-generates. Request-scoped here, so after() is the right primitive.
  if (existing.status !== status && (status === "TEST" || status === "DONE")) {
    after(() => maybeAutoGenerateTestDoc(key));
  }

  return NextResponse.json({ status, ...(jiraError ? { jiraWarning: "Jira update failed" } : {}) });
}
