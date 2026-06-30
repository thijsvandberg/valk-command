import { db } from "@/db";
import { ticket, ticketStatusChange, ticketScopeChange, statusChangeSeen, jiraComment, storyVersion, ticketSubtask } from "@/db/schema";
import { and, eq, ne, isNull, isNotNull, inArray, notExists, desc, sql } from "drizzle-orm";
import { buildAssignee } from "@/lib/user-utils";
import type { Assignee, JiraStatus } from "@/types/ticket";

// BRDG-414: the active-sprint status-change review queue. Returns the latest UNSEEN
// status change per ticket on the given sprint(s), with the data the board line needs:
// who/when, what else is new (comments / story edits in the last 24h, not by me), and
// the open-subtask count (for the Done/Deprecated flag). Deploy/pipeline signals are
// NOT joined here — the board already has those maps client-side.
//
// BRDG-439: the same line also surfaces "added to sprint" events. A ticket qualifies for
// a line if it has an unseen status change OR an unseen sprint-add (or both, combined into
// one line). Sprint-adds come from ticketScopeChange rows that carry an actor — the burnup
// backfill leaves changedBy null, so this read ignores those and never shows synthetic adds.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface StatusChangeQueryCtx {
  userId: string;
  // Acting user's display name, for the "what's new, but not by me" self-exclusion.
  // Comments/versions carry no accountId, so the match is name-based (single-PO app).
  jiraName: string | null;
}

// BRDG-439: who moved the ticket into the sprint + when. Attached to the line when present.
export interface SprintAddInfo {
  id: string;
  changedBy: string | null;
  changedByAccountId: string | null;
  changedByAvatar: string | null;
  changedAt: string;
}

export interface StatusChangeItem {
  // Status-change id; null for a sprint-add-only line (no status transition).
  id: string | null;
  ticketKey: string;
  fromStatus: string | null;
  // null for a sprint-add-only line.
  toStatus: JiraStatus | null;
  changedAt: string;
  changedBy: string | null;
  changedByAccountId: string | null;
  changedByAvatar: string | null;
  assignee: Assignee | null;
  openSubtaskCount: number;
  totalSubtaskCount: number;
  newCommentCount: number;
  lastCommentAt: string | null;
  storyEditedAt: string | null;
  sprintAdded: SprintAddInfo | null;
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
  // Scoped by the active sprint's ticket keys (robust: ticketStatusChange.sprintName is
  // stored inconsistently as a name or id across sync paths).
  ticketKeys: string[],
  nowMs: number = Date.now(),
): Promise<StatusChangeItem[]> {
  if (ticketKeys.length === 0) return [];

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
    .where(
      and(
        inArray(ticketStatusChange.ticketKey, ticketKeys),
        isNull(ticket.removedFromJiraAt),
        // Only the transition that led to the CURRENT status. A later transition (e.g.
        // Done -> In Progress) supersedes an earlier "-> Done", so a stale change whose
        // toStatus no longer matches the ticket is not shown (BRDG-414).
        eq(ticketStatusChange.toStatus, ticket.status),
        unseenByUser,
      ),
    )
    .orderBy(desc(ticketStatusChange.changedAt));

  // One line per ticket: the most recent unseen change (rows are already newest-first).
  const latestByKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latestByKey.has(r.ticketKey)) latestByKey.set(r.ticketKey, r);

  // BRDG-439: the latest UNSEEN "added to sprint" per ticket. Only rows with a known actor
  // (changedBy) — the burnup backfill writes actor-less rows we must not surface — and only
  // while the ticket is still in a sprint (sprintName set). Reuses statusChangeSeen on the
  // opaque scope-change id, so dismissing marks it seen the same way as a status change.
  const sprintUnseenByUser = notExists(
    db
      .select({ one: sql`1` })
      .from(statusChangeSeen)
      .where(
        and(
          eq(statusChangeSeen.userId, ctx.userId),
          eq(statusChangeSeen.statusChangeId, ticketScopeChange.id),
        ),
      ),
  );

  const sprintRows = await db
    .select({
      id: ticketScopeChange.id,
      ticketKey: ticketScopeChange.ticketKey,
      changedAt: ticketScopeChange.changedAt,
      changedBy: ticketScopeChange.changedBy,
      changedByAccountId: ticketScopeChange.changedByAccountId,
      changedByAvatar: ticketScopeChange.changedByAvatar,
      assignee: ticket.assignee,
      assigneeAccountId: ticket.assigneeAccountId,
    })
    .from(ticketScopeChange)
    .innerJoin(ticket, eq(ticket.jiraKey, ticketScopeChange.ticketKey))
    .where(
      and(
        inArray(ticketScopeChange.ticketKey, ticketKeys),
        eq(ticketScopeChange.action, "added"),
        isNotNull(ticketScopeChange.changedBy),
        isNull(ticket.removedFromJiraAt),
        sql`${ticket.sprintName} is not null and ${ticket.sprintName} != ''`,
        sprintUnseenByUser,
      ),
    )
    .orderBy(desc(ticketScopeChange.changedAt));

  const latestSprintByKey = new Map<string, (typeof sprintRows)[number]>();
  for (const r of sprintRows) if (!latestSprintByKey.has(r.ticketKey)) latestSprintByKey.set(r.ticketKey, r);

  // A ticket gets a line if it has an unseen status change OR an unseen sprint-add.
  const keys = [...new Set<string>([...latestByKey.keys(), ...latestSprintByKey.keys()])];
  if (keys.length === 0) return [];

  // Open subtask count (same rule as the board payload): non-DONE/DEPRECATED subtasks.
  const subRows = await db
    .select({
      ticketKey: ticketSubtask.ticketKey,
      open: sql<number>`SUM(CASE WHEN ${ticketSubtask.status} NOT IN ('DONE', 'DEPRECATED') THEN 1 ELSE 0 END)`.as("open"),
      total: sql<number>`COUNT(*)`.as("total"),
    })
    .from(ticketSubtask)
    .where(inArray(ticketSubtask.ticketKey, keys))
    .groupBy(ticketSubtask.ticketKey);
  const openByKey = new Map(subRows.map((r) => [r.ticketKey, r.open ?? 0]));
  const totalByKey = new Map(subRows.map((r) => [r.ticketKey, r.total ?? 0]));

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

  return keys.map((key) => {
    const s = latestByKey.get(key);
    const sa = latestSprintByKey.get(key);
    const c = commentAgg.get(key);
    const v = versionAgg.get(key);
    // Both rows join the same ticket; either source supplies the assignee.
    const assigneeName = s?.assignee ?? sa?.assignee ?? null;
    const assigneeAccountId = s?.assigneeAccountId ?? sa?.assigneeAccountId ?? null;
    return {
      id: s?.id ?? null,
      ticketKey: key,
      fromStatus: s?.fromStatus ?? null,
      toStatus: (s?.toStatus ?? null) as JiraStatus | null,
      changedAt: s?.changedAt ?? sa?.changedAt ?? "",
      changedBy: s?.changedBy ?? null,
      changedByAccountId: s?.changedByAccountId ?? null,
      changedByAvatar: s?.changedByAvatar ?? null,
      assignee: buildAssignee(assigneeName, assigneeAccountId),
      openSubtaskCount: openByKey.get(key) ?? 0,
      totalSubtaskCount: totalByKey.get(key) ?? 0,
      newCommentCount: c?.count ?? 0,
      lastCommentAt: c?.lastRaw ?? null,
      storyEditedAt: v?.lastRaw ?? null,
      sprintAdded: sa
        ? {
            id: sa.id,
            changedBy: sa.changedBy,
            changedByAccountId: sa.changedByAccountId,
            changedByAvatar: sa.changedByAvatar,
            changedAt: sa.changedAt,
          }
        : null,
    };
  });
}
