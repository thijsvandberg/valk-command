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

type RouteContext = { params: Promise<{ key: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required and must be non-empty", 400);
  }

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!existing) {
    return errorResponse("Ticket not found", 404);
  }

  await db.update(ticket).set({ title }).where(eq(ticket.jiraKey, key));

  // Push to Jira in the background; failure does not block the response
  let jiraError: string | undefined;
  try {
    await jiraClient.updateIssue(key, { summary: title });
    await syncJiraTimestamp(key);
  } catch (err) {
    jiraError = err instanceof Error ? err.message : String(err);
    logger.warn("ticket-summary", `Jira summary update failed for ${key}: ${jiraError}`);
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // The title is also rendered in the epic's children table, embedded in the
  // epic's cached detail.
  if (existing.epicKey) {
    cache.invalidate(`/api/tickets/${existing.epicKey}`);
  }

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Renamed to "${title}"${jiraError ? " (Bridge only — Jira update failed)" : ""}`,
  });

  return NextResponse.json({ title, ...(jiraError ? { jiraWarning: "Jira update failed" } : {}) });
}
