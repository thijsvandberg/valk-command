import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { applyRateLimit } from "@/lib/rate-limiter";
import type { JiraStatus } from "@/types/ticket";

type RouteContext = { params: Promise<{ key: string }> };

const VALID_STATUSES: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

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
  try {
    await jiraClient.transitionIssue(key, status);
    await syncJiraTimestamp(key);
  } catch (err) {
    jiraError = err instanceof Error ? err.message : String(err);
    logger.warn("ticket-status", `Jira transition failed for ${key} (updating locally anyway): ${jiraError}`);
  }

  await db.update(ticket).set({ status }).where(eq(ticket.jiraKey, key));

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Changed status to ${status}${jiraError ? " (Bridge only — Jira transition unavailable)" : ""}`,
  });

  return NextResponse.json({ status, ...(jiraError ? { jiraWarning: "Jira update failed" } : {}) });
}
