import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { landNewTicket } from "@/lib/sprint-rank";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";

/**
 * Creates a brand-new Jira story and a minimal local ticket record.
 * Returns the new ticket key so the caller can navigate to /tickets/[key]/write.
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("story-writer");
  if (limited) return limited;

  let body: { title?: string; sprintId?: string; issueType?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body stays empty
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const issueType = body.issueType ?? "story";
  const sprintId =
    typeof body.sprintId === "string" && body.sprintId.trim() ? body.sprintId.trim() : undefined;

  let newKey: string;
  try {
    const result = await jiraClient.createIssue({
      summary: title,
      issueType,
      // Empty ADF doc prevents Jira from applying its default issue type template
      description: { type: "doc", version: 1, content: [] },
    });
    newKey = result.key;
  } catch (err) {
    logger.error("story-writer-create", "Failed to create Jira issue:", err);
    return NextResponse.json(
      { error: "Failed to create story in Jira" },
      { status: 502 },
    );
  }

  // Jira Cloud silently ignores the sprint field on create, so assign it via the
  // same field-edit path as drag-to-sprint once the issue exists, then place it per
  // the unified create rule (BRDG-371). Only persist the sprint locally when Jira
  // confirms the move; a rank failure is best-effort and must not undo the move.
  let assignedSprintId: string | undefined;
  if (sprintId) {
    const sprintIdNum = parseInt(sprintId, 10);
    if (!Number.isNaN(sprintIdNum)) {
      try {
        await jiraClient.moveToSprint([newKey], sprintIdNum);
        assignedSprintId = sprintId;
      } catch (err) {
        logger.error("story-writer-create", `Created ${newKey} but sprint assignment to ${sprintId} failed: ${err}`);
      }
    }
  }

  await Promise.all([
    db.insert(ticket).values({
      jiraKey: newKey,
      title,
      type: issueType,
      status: "TO DO",
      ...(assignedSprintId ? { sprintName: assignedSprintId, sprintIds: JSON.stringify([assignedSprintId]) } : {}),
    }),
    db.insert(ticketMetadata).values({
      jiraKey: newKey,
      readiness: "drafting",
    }),
    logActivity({
      type: "story-writer",
      scope: newKey,
      summary: `Created new story: ${newKey} — ${title}`,
    }),
  ]);

  // Mirror the sprint membership into the indexed bridge so the by-sprint board
  // shows the new story in its column. Backlog (no sprint) leaves no rows.
  syncTicketSprints(db, newKey, assignedSprintId ? [assignedSprintId] : null, assignedSprintId ?? null);

  // Place it per the unified create rule (BRDG-371): bottom of a regular sprint, top
  // of a backlog (named or generic). Applied in Jira and the local mirror.
  await landNewTicket(newKey, assignedSprintId ?? null);

  cache.invalidate(/^\/api\/tickets(\?|$)/);
  if (assignedSprintId) cache.invalidate("/api/jira/sprints");

  return NextResponse.json({ key: newKey }, { status: 201 });
}
