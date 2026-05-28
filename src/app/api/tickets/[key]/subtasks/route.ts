import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticketSubtask } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { randomUUID } from "crypto";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const rows = await db.query.ticketSubtask.findMany({
    where: (s, { eq: eqFn }) => eqFn(s.ticketKey, key),
  });

  const subtasks = rows.map((r) => ({
    key: r.subtaskKey,
    title: r.title,
    status: r.status,
  }));

  return NextResponse.json(subtasks);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return errorResponse("Ticket not found", 404);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }

  const projectKey = key.split("-")[0];

  let jiraResult: { key: string; id: string };
  try {
    jiraResult = await jiraClient.createIssue({
      summary: title,
      parentKey: key,
      projectKey,
    });
  } catch (err) {
    logger.error("subtask-create", `Jira create failed for parent ${key}: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  await db.insert(ticketSubtask).values({
    id: randomUUID(),
    ticketKey: key,
    subtaskKey: jiraResult.key,
    title,
    type: "subtask",
    status: "TO DO",
    assignee: null,
    assigneeAvatar: null,
  });

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Created subtask ${jiraResult.key}: ${title}`,
  });

  return NextResponse.json({
    key: jiraResult.key,
    title,
    type: "subtask",
    jiraStatus: "TO DO",
    assignee: null,
  });
}
