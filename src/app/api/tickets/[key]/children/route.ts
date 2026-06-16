import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { landTicketAtTopOfSprint } from "@/lib/sprint-rank";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";

type RouteContext = { params: Promise<{ key: string }> };

const ALLOWED_TYPES = ["Story", "Task", "Bug", "Spike"];

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
  const body = parsed.data as { title?: string; issueType?: string; sprintId?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }

  const issueType = body.issueType ?? "Story";
  if (!ALLOWED_TYPES.includes(issueType)) {
    return errorResponse(`issueType must be one of: ${ALLOWED_TYPES.join(", ")}`, 400);
  }

  // Optional target sprint. Absent/blank keeps the issue in the backlog (Jira default).
  const sprintId = typeof body.sprintId === "string" && body.sprintId.trim() ? body.sprintId.trim() : undefined;

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

  // Assign the sprint via the same field-edit path as drag-to-sprint. Jira Cloud
  // silently ignores the sprint field on create, so the issue must already exist.
  // Only persist the local sprint when Jira confirms the move, so the by-sprint
  // view never shows the child in a sprint it is not actually in.
  let assignedSprintId: string | undefined;
  if (sprintId) {
    const sprintIdNum = parseInt(sprintId, 10);
    if (!Number.isNaN(sprintIdNum)) {
      try {
        await jiraClient.moveToSprint([jiraResult.key], sprintIdNum);
        assignedSprintId = sprintId;
      } catch (err) {
        logger.error("child-create", `Created ${jiraResult.key} but sprint assignment to ${sprintId} failed: ${err}`);
      }
    }
  }

  await db.insert(ticket).values({
    jiraKey: jiraResult.key,
    jiraId: jiraResult.id,
    title,
    type: issueType.toLowerCase(),
    status: "TO DO",
    epic: parent.title,
    epicKey: key,
    // The sprint_name column stores the sprint id; the detail builder resolves it
    // to a display name via sprintNameCache (same convention as the Jira sync).
    ...(assignedSprintId ? { sprintName: assignedSprintId, sprintIds: JSON.stringify([assignedSprintId]) } : {}),
    flagged: false,
  });

  // Mirror the membership into the indexed bridge so the by-sprint board shows
  // the new child, then land it at the top of its sprint (BRDG-354). Best-effort.
  if (assignedSprintId) {
    syncTicketSprints(db, jiraResult.key, [assignedSprintId], assignedSprintId);
    await landTicketAtTopOfSprint(jiraResult.key, parseInt(assignedSprintId, 10));
  }

  // New child issues start in the PO "drafting" stage so they surface for
  // refinement. Readiness is Bridge-only metadata (ticket_metadata), which the
  // epic children view reads, so it persists across the refetch.
  await db
    .insert(ticketMetadata)
    .values({ jiraKey: jiraResult.key, readiness: "drafting" })
    .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: { readiness: "drafting" } });

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
