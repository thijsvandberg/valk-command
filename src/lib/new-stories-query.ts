import { db } from "@/db";
import { ticket, ticketMetadata, sprintNameCache } from "@/db/schema";
import { and, or, eq, isNull, inArray, notInArray, desc, sql } from "drizzle-orm";
import { buildAssignee } from "@/lib/user-utils";
import type { IssueType } from "@/types/ticket";
import type { NewStoryRow } from "@/lib/new-stories-types";

// Issue types the PO reviews in the inbox. Sub-tasks are deliberately excluded
// (BRDG-356); epics ARE included, which is why this cannot reuse /api/tickets
// (that route drops epics).
const ALLOWED_TYPES: IssueType[] = ["story", "bug", "task", "epic", "spike"];

// Drafting/replaced/failed tickets are not real, reviewable stories yet.
const EXCLUDED_STATUSES = ["DRAFTING", "REPLACED", "DRAFT_FAILED"];

// Shared filter: unread (no read stamp, which also covers tickets with no
// metadata row via the left join), still present in Jira, a reviewable status,
// and a non-subtask type (a null type is treated as a story, matching the rest
// of the app).
function newStoriesWhere() {
  return and(
    isNull(ticketMetadata.newStoryReadAt),
    isNull(ticket.removedFromJiraAt),
    notInArray(ticket.status, EXCLUDED_STATUSES),
    or(inArray(ticket.type, ALLOWED_TYPES), isNull(ticket.type)),
  );
}

export async function listNewStories(): Promise<NewStoryRow[]> {
  const rows = await db
    .select({ t: ticket, sprintDisplayName: sprintNameCache.displayName })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(newStoriesWhere())
    .orderBy(desc(ticket.jiraCreatedAt));

  return rows.map(({ t, sprintDisplayName }) => ({
    key: t.jiraKey,
    title: t.title,
    type: (t.type ?? "story") as IssueType,
    epic: t.epic ?? null,
    epicKey: t.epicKey ?? null,
    storyPoints: t.storyPoints ?? null,
    assignee: buildAssignee(t.assignee),
    reporter: buildAssignee(t.reporter),
    sprintName: sprintDisplayName ?? (t.sprintName ? t.sprintName : null),
    jiraCreatedAt: t.jiraCreatedAt ?? null,
  }));
}

export async function countNewStories(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(newStoriesWhere());
  return row?.count ?? 0;
}
