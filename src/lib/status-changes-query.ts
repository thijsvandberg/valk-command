import { db } from "@/db";
import { ticket, ticketStatusChange, statusChangeSeen, jiraComment, storyVersion, ticketSubtask } from "@/db/schema";
import { and, eq, ne, isNull, inArray, notExists, desc, sql } from "drizzle-orm";
import { buildAssignee } from "@/lib/user-utils";
import type { Assignee, JiraStatus } from "@/types/ticket";

// BRDG-414: the active-sprint status-change review queue. Returns the latest UNSEEN
// status change per ticket on the given sprint(s), with the data the board line needs:
// who/when, what else is new (comments / story edits in the last 24h, not by me), and
// the open-subtask count (for the Done/Deprecated flag). Deploy/pipeline signals are
// NOT joined here — the board already has those maps client-side.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface StatusChangeQueryCtx {
  userId: string;
  // Acting user's display name, for the "what's new, but not by me" self-exclusion.
  // Comments/versions carry no accountId, so the match is name-based (single-PO app).
  jiraName: string | null;
}

export interface StatusChangeItem {
  id: string;
  ticketKey: string;
  fromStatus: string | null;
  toStatus: JiraStatus;
  changedAt: string;
  changedBy: string | null;
  changedByAccountId: string | null;
  changedByAvatar: string | null;
  assignee: Assignee | null;
  openSubtaskCount: number;
  newCommentCount: number;
  lastCommentAt: string | null;
  storyEditedAt: string | null;
}

// jiraComment.createdAt is Jira ISO (with `T`); storyVersion.createdAt uses the SQLite
// default ("YYYY-MM-DD HH:MM:SS", UTC). Normalise both to a UTC epoch for the precise
// 24h test (the SQL pre-filter is only coarse, by date prefix).
function parseDbTime(s: string): number {
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export async function listUnseenStatusChanges(
  ctx: StatusChangeQueryCtx,
  sprintIds: string[],
  nowMs: number = Date.now(),
): Promise<StatusChangeItem[]> {
  if (sprintIds.length === 0) return [];

  const unseenByUser = notExists(
    db
      .select({ one: sql`1` })
      .from(statusChangeSeen)
      .where(
        and(
          eq(statusChangeSeen.userId, ctx.userId),
          eq(statusChangeSeen.statusChangeId, ticketStatusChange.id),
        ),
      ),
  );

  const rows = await db
    .select({
      id: ticketStatusChange.id,
      ticketKey: ticketStatusChange.ticketKey,
      fromStatus: ticketStatusChange.fromStatus,
      toStatus: ticketStatusChange.toStatus,
      changedAt: ticketStatusChange.changedAt,
      changedBy: ticketStatusChange.changedBy,
      changedByAccountId: ticketStatusChange.changedByAccountId,
      changedByAvatar: ticketStatusChange.changedByAvatar,
      assignee: ticket.assignee,
      assigneeAccountId: ticket.assigneeAccountId,
    })
    .from(ticketStatusChange)
    .innerJoin(ticket, eq(ticket.jiraKey, ticketStatusChange.ticketKey))
    .where(and(inArray(ticketStatusChange.sprintName, sprintIds), isNull(ticket.removedFromJiraAt), unseenByUser))
    .orderBy(desc(ticketStatusChange.changedAt));

  // One line per ticket: the most recent unseen change (rows are already newest-first).
  const latestByKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latestByKey.has(r.ticketKey)) latestByKey.set(r.ticketKey, r);
  const items = [...latestByKey.values()];
  if (items.length === 0) return [];
  const keys = items.map((r) => r.ticketKey);

  // Open subtask count (same rule as the board payload): non-DONE/DEPRECATED subtasks.
  const subRows = await db
    .select({
      ticketKey: ticketSubtask.ticketKey,
      open: sql<number>`SUM(CASE WHEN ${ticketSubtask.status} NOT IN ('DONE', 'DEPRECATED') THEN 1 ELSE 0 END)`.as("open"),
    })
    .from(ticketSubtask)
    .where(inArray(ticketSubtask.ticketKey, keys))
    .groupBy(ticketSubtask.ticketKey);
  const openByKey = new Map(subRows.map((r) => [r.ticketKey, r.open ?? 0]));

  // Coarse date-prefix pre-filter (format-agnostic); JS refines to the exact 24h window.
  const floorDate = new Date(nowMs - WINDOW_MS).toISOString().slice(0, 10);
  const cutoff = nowMs - WINDOW_MS;

  const commentRows = await db
    .select({ ticketKey: jiraComment.ticketKey, authorName: jiraComment.authorName, createdAt: jiraComment.createdAt })
    .from(jiraComment)
    .where(
      and(
        inArray(jiraComment.ticketKey, keys),
        sql`substr(${jiraComment.createdAt}, 1, 10) >= ${floorDate}`,
        ctx.jiraName ? ne(jiraComment.authorName, ctx.jiraName) : undefined,
      ),
    );

  const versionRows = await db
    .select({ jiraKey: storyVersion.jiraKey, updatedBy: storyVersion.updatedBy, createdAt: storyVersion.createdAt })
    .from(storyVersion)
    .where(
      and(
        inArray(storyVersion.jiraKey, keys),
        sql`substr(${storyVersion.createdAt}, 1, 10) >= ${floorDate}`,
        ctx.jiraName ? ne(storyVersion.updatedBy, ctx.jiraName) : undefined,
      ),
    );

  const commentAgg = new Map<string, { count: number; lastMs: number; lastRaw: string }>();
  for (const c of commentRows) {
    const t = parseDbTime(c.createdAt);
    if (t < cutoff) continue;
    const cur = commentAgg.get(c.ticketKey) ?? { count: 0, lastMs: 0, lastRaw: c.createdAt };
    cur.count += 1;
    if (t >= cur.lastMs) { cur.lastMs = t; cur.lastRaw = c.createdAt; }
    commentAgg.set(c.ticketKey, cur);
  }

  const versionAgg = new Map<string, { lastMs: number; lastRaw: string }>();
  for (const v of versionRows) {
    const t = parseDbTime(v.createdAt);
    if (t < cutoff) continue;
    const cur = versionAgg.get(v.jiraKey);
    if (!cur || t >= cur.lastMs) versionAgg.set(v.jiraKey, { lastMs: t, lastRaw: v.createdAt });
  }

  return items.map((r) => {
    const c = commentAgg.get(r.ticketKey);
    const v = versionAgg.get(r.ticketKey);
    return {
      id: r.id,
      ticketKey: r.ticketKey,
      fromStatus: r.fromStatus,
      toStatus: (r.toStatus ?? "TO DO") as JiraStatus,
      changedAt: r.changedAt,
      changedBy: r.changedBy,
      changedByAccountId: r.changedByAccountId,
      changedByAvatar: r.changedByAvatar,
      assignee: buildAssignee(r.assignee, r.assigneeAccountId),
      openSubtaskCount: openByKey.get(r.ticketKey) ?? 0,
      newCommentCount: c?.count ?? 0,
      lastCommentAt: c?.lastRaw ?? null,
      storyEditedAt: v?.lastRaw ?? null,
    };
  });
}
