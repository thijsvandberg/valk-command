import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (parent.type !== "epic") {
    return NextResponse.json({ error: "Parent must be an epic" }, { status: 400 });
  }

  let body: { title?: string; issueType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const issueType = body.issueType ?? "Story";
  if (!ALLOWED_TYPES.includes(issueType)) {
    return NextResponse.json(
      { error: `issueType must be one of: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
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
    return NextResponse.json({ error: message }, { status: 502 });
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
