import { db } from "@/db";
import { ticket, newStoryRead, sprintNameCache } from "@/db/schema";
import { and, or, eq, ne, isNull, inArray, notInArray, notExists, desc, sql } from "drizzle-orm";
import { buildAssignee } from "@/lib/user-utils";
import type { IssueType, JiraStatus } from "@/types/ticket";
import type { NewStoryRow } from "@/lib/new-stories-types";

// Issue types the PO reviews in the inbox. Sub-tasks are deliberately excluded
// (BRDG-356); epics ARE included, which is why this cannot reuse /api/tickets
// (that route drops epics).
const ALLOWED_TYPES: IssueType[] = ["story", "bug", "task", "epic", "spike"];

// Drafting/replaced/failed tickets are not real, reviewable stories yet.
const EXCLUDED_STATUSES = ["DRAFTING", "REPLACED", "DRAFT_FAILED"];

// Who is asking. Drives the two per-user behaviours (BRDG-359): read state is
// filtered against this user's rows, and stories this user authored are excluded.
// jiraAccountId is the stable self-identity (BRDG-360); jiraName is the
// display-name fallback used only when no accountId is available.
export interface NewStoryQueryCtx {
  userId: string;
  jiraAccountId: string | null;
  jiraName: string | null;
}

// Exclude stories whose reporter is the acting user (BRDG-359). Prefer the
// stable accountId; fall back to the display name; when neither is known (dev
// bypass / no recorded identity) exclude nothing. The OR-with-isNull guard keeps
// tickets that have no captured reporter id/name from silently vanishing, since
// `ne(null, x)` is NULL (false-y) in SQL.
function selfExclusion(ctx: NewStoryQueryCtx) {
  if (ctx.jiraAccountId) {
    return or(isNull(ticket.reporterAccountId), ne(ticket.reporterAccountId, ctx.jiraAccountId));
  }
  if (ctx.jiraName) {
    return or(isNull(ticket.reporter), ne(ticket.reporter, ctx.jiraName));
  }
  return undefined;
}

// Shared filter: unread for THIS user (no read row), still present in Jira, a
// reviewable status, a non-subtask type (a null type is treated as a story,
// matching the rest of the app), and not authored by this user.
function newStoriesWhere(ctx: NewStoryQueryCtx) {
  const unreadByUser = notExists(
    db
      .select({ one: sql`1` })
      .from(newStoryRead)
      .where(
        and(
          eq(newStoryRead.userId, ctx.userId),
          eq(newStoryRead.ticketKey, ticket.jiraKey),
        ),
      ),
  );

  return and(
    unreadByUser,
    isNull(ticket.removedFromJiraAt),
    notInArray(ticket.status, EXCLUDED_STATUSES),
    or(inArray(ticket.type, ALLOWED_TYPES), isNull(ticket.type)),
    selfExclusion(ctx),
  );
}

export async function listNewStories(ctx: NewStoryQueryCtx): Promise<NewStoryRow[]> {
  const rows = await db
    .select({ t: ticket, sprintDisplayName: sprintNameCache.displayName })
    .from(ticket)
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(newStoriesWhere(ctx))
    .orderBy(desc(ticket.jiraCreatedAt));

  return rows.map(({ t, sprintDisplayName }) => ({
    key: t.jiraKey,
    title: t.title,
    type: (t.type ?? "story") as IssueType,
    jiraStatus: (t.status ?? "TO DO") as JiraStatus,
    epic: t.epic ?? null,
    epicKey: t.epicKey ?? null,
    storyPoints: t.storyPoints ?? null,
    assignee: buildAssignee(t.assignee),
    reporter: buildAssignee(t.reporter),
    sprintName: sprintDisplayName ?? (t.sprintName ? t.sprintName : null),
    jiraCreatedAt: t.jiraCreatedAt ?? null,
  }));
}

export async function countNewStories(ctx: NewStoryQueryCtx): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ticket)
    .where(newStoriesWhere(ctx));
  return row?.count ?? 0;
}
