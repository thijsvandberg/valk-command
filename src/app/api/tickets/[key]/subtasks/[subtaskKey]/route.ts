import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { eq, and } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticketSubtask } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";

type RouteContext = { params: Promise<{ key: string; subtaskKey: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { key, subtaskKey } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;
  const invalidSub = validatePathParam(subtaskKey);
  if (invalidSub) return invalidSub;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }
  if (title.length > 255) {
    return errorResponse("title too long", 400);
  }

  try {
    await jiraClient.updateIssue(subtaskKey, { summary: title });
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.error("subtask-rename", `Jira update failed for ${subtaskKey}: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  await db
    .update(ticketSubtask)
    .set({ title })
    .where(
      and(eq(ticketSubtask.ticketKey, key), eq(ticketSubtask.subtaskKey, subtaskKey)),
    );

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Renamed subtask ${subtaskKey}: ${title}`,
  });

  return NextResponse.json({ key: subtaskKey, title });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { key, subtaskKey } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;
  const invalidSub = validatePathParam(subtaskKey);
  if (invalidSub) return invalidSub;

  try {
    await jiraClient.updateIssue(subtaskKey, { summary: "deleteme" });
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.error("subtask-delete", `Jira rename-to-deleteme failed for ${subtaskKey}: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  await db
    .delete(ticketSubtask)
    .where(
      and(eq(ticketSubtask.ticketKey, key), eq(ticketSubtask.subtaskKey, subtaskKey)),
    );

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Deleted subtask ${subtaskKey}`,
  });

  return NextResponse.json({ ok: true });
}
