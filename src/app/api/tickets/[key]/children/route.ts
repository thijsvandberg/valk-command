import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";

type RouteContext = { params: Promise<{ key: string }> };

const ALLOWED_TYPES = ["Story", "Task", "Bug"];

export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parent = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!parent) {
    return errorResponse("Ticket not found", 404);
  }

  if (parent.type !== "epic") {
    return errorResponse("Parent must be an epic", 400);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string; issueType?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }

  const issueType = body.issueType ?? "Story";
  if (!ALLOWED_TYPES.includes(issueType)) {
    return errorResponse(`issueType must be one of: ${ALLOWED_TYPES.join(", ")}`, 400);
  }

  const projectKey = key.split("-")[0];

  let jiraResult: { key: string; id: string };
  try {
    jiraResult = await jiraClient.createIssue({
      summary: title,
      issueType,
      parentKey: key,
      projectKey,
    });
  } catch (err) {
    logger.error("child-create", `Jira create failed for epic ${key}: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  await db.insert(ticket).values({
    jiraKey: jiraResult.key,
    jiraId: jiraResult.id,
    title,
    type: issueType.toLowerCase(),
    status: "TO DO",
    epic: parent.title,
    epicKey: key,
    flagged: false,
  });

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Created child ${issueType.toLowerCase()} ${jiraResult.key}: ${title}`,
  });

  return NextResponse.json({
    key: jiraResult.key,
    title,
    type: issueType.toLowerCase(),
    jiraStatus: "TO DO",
    assignee: null,
  });
}
