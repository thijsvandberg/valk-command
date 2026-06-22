import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { landNewTicket } from "@/lib/sprint-rank";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { env } from "@/lib/env";

// Shared "create a real Jira issue + mirror it locally" path (BRDG-304). Extracted
// from POST /api/tickets so both the board's create flow and placeholder promotion
// land tickets through one route: create the Jira issue, optionally move it into a
// sprint, then insert the local ticket + metadata rows. Keeping this single seam
// also lines up the Epic Writer's per-card "Create in Jira" (BRDG-291/295) to reuse
// it later.

export const CREATABLE_TYPES = ["Story", "Task", "Bug", "Spike"];

export interface CreateTicketInput {
  title: string;
  // Capitalized Jira issue type; must be one of CREATABLE_TYPES.
  issueType: string;
  // Optional target sprint id (string). Absent keeps the issue in the backlog.
  sprintId?: string;
  // Optional parent epic key.
  epicKey?: string;
}

export interface CreateTicketResult {
  key: string;
  id: string;
  title: string;
  // Lower-case type, matching the ticket.type convention.
  type: string;
  // The sprint the issue actually landed in (null when none / move failed).
  sprintId: string | null;
  epic: string | null;
  epicKey: string | null;
}

/**
 * Creates a real Jira issue and mirrors it into the local ticket + metadata
 * tables. Throws if the Jira create call fails (callers map this to a 502). A
 * failed sprint move is tolerated: the issue is still created, just left in the
 * backlog, mirroring the board's existing behaviour.
 */
export async function createTicketWithJira(input: CreateTicketInput): Promise<CreateTicketResult> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (!CREATABLE_TYPES.includes(input.issueType)) {
    throw new Error(`issueType must be one of: ${CREATABLE_TYPES.join(", ")}`);
  }

  const sprintId =
    typeof input.sprintId === "string" && input.sprintId.trim() ? input.sprintId.trim() : undefined;
  const epicKey =
    typeof input.epicKey === "string" && input.epicKey.trim() ? input.epicKey.trim() : undefined;

  // Resolve the epic title so the local row carries the same epic label the board
  // groups and chips by. A missing epic is tolerated: the link still goes to Jira.
  let epicTitle: string | null = null;
  if (epicKey) {
    const epic = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, epicKey),
    });
    epicTitle = epic?.title ?? null;
  }

  const jiraResult = await jiraClient.createIssue({
    summary: title,
    issueType: input.issueType,
    projectKey: env.JIRA_PROJECT_KEY,
    ...(epicKey ? { parentKey: epicKey } : {}),
  });

  // Assign the sprint via the same field-edit path as drag-to-sprint. Jira Cloud
  // silently ignores the sprint field on create, so the issue must already exist.
  // Only persist the local sprint when Jira confirms the move, so the board never
  // shows the new ticket in a sprint it is not actually in.
  let assignedSprintId: string | undefined;
  if (sprintId) {
    const sprintIdNum = parseInt(sprintId, 10);
    if (!Number.isNaN(sprintIdNum)) {
      try {
        await jiraClient.moveToSprint([jiraResult.key], sprintIdNum);
        assignedSprintId = sprintId;
      } catch (err) {
        logger.error("ticket-create", `Created ${jiraResult.key} but sprint assignment to ${sprintId} failed: ${err}`);
      }
    }
  }

  await db.insert(ticket).values({
    jiraKey: jiraResult.key,
    jiraId: jiraResult.id,
    title,
    type: input.issueType.toLowerCase(),
    status: "TO DO",
    ...(epicKey ? { epic: epicTitle, epicKey } : {}),
    ...(assignedSprintId ? { sprintName: assignedSprintId, sprintIds: JSON.stringify([assignedSprintId]) } : {}),
    flagged: false,
  });

  // Mirror the membership into the indexed bridge. Backlog (no sprint) → no rows.
  syncTicketSprints(db, jiraResult.key, assignedSprintId ? [assignedSprintId] : null, assignedSprintId ?? null);

  // Place it per the unified create rule (BRDG-371): bottom of a regular sprint, top
  // of a backlog (named or generic). Applied in Jira and the local mirror. Best-effort.
  await landNewTicket(jiraResult.key, assignedSprintId ?? null);

  // New tickets start in the PO "drafting" stage so they surface for refinement.
  await db
    .insert(ticketMetadata)
    .values({ jiraKey: jiraResult.key, readiness: "drafting" })
    .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: { readiness: "drafting" } });

  cache.invalidate(/^\/api\/tickets(\?|$)/);
  // New tickets land in the backlog; the cached sprints payload embeds backlogCount.
  cache.invalidate("/api/jira/sprints");

  await logActivity({
    type: "metadata-update",
    scope: jiraResult.key,
    summary: `Created ${input.issueType.toLowerCase()} ${jiraResult.key}: ${title}`,
  });

  return {
    key: jiraResult.key,
    id: jiraResult.id,
    title,
    type: input.issueType.toLowerCase(),
    sprintId: assignedSprintId ?? null,
    epic: epicKey ? epicTitle : null,
    epicKey: epicKey ?? null,
  };
}
