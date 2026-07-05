import { db } from "@/db";
import { ticket, ticketStatusChange, ticketScopeChange, statusChangeSeen, jiraComment, storyVersion, ticketSubtask, pipelineRun, ticketMetadata } from "@/db/schema";
import { and, eq, ne, isNull, isNotNull, inArray, notExists, desc, sql } from "drizzle-orm";
import { buildAssignee } from "@/lib/user-utils";
import { isInFlightStatus } from "@/lib/ticket-status";
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

// BRDG-446: a fresh UAT deploy on an in-flight ticket. Attached to the line when present;
// when it is the ONLY reason the row surfaces, the line reads "New version on UAT".
export interface DeployAddInfo {
  // Synthesized per-ticket seen-key (see deploySeenKey); dismissal keys on this.
  id: string;
  environment: string;
  completedAt: string;
  state: string;
}

// BRDG-446: synthesized per-ticket seen-key for a deploy line. Per-ticket (not per pipeline
// run) so dismissing one ticket's deploy never dismisses another ticket that shares the same
// multi-ticket deploy (ticketKeys fan-out, BRDG-269). Reuses statusChangeSeen, whose
// statusChangeId has no FK, so any opaque string is a valid id (same trick as sprint-adds).
export function deploySeenKey(ticketKey: string, pipelineRunId: string): string {
  return `deploy:${ticketKey}:${pipelineRunId}`;
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
  deployAdded: DeployAddInfo | null;
  // BRDG-471: a test-doc draft is waiting for acceptance on this ticket. Purely
  // state-derived (no seen-key), so it is not dismissible and persists until the
  // draft is accepted or the ticket is marked not-needed. When it is the only
  // reason, the line reads "Test documentation generated, please review".
  testDocReady: boolean;
  // BRDG-474: when the pending draft was generated (ISO), and whether the story
  // or comments moved AFTER that instant — the generated doc may now be stale.
  // Drives the "please review — the story has changed since" clause. Null time
  // means the generation instant is unknown (legacy draft), so staleness is
  // reported as false.
  testDocGeneratedAt: string | null;
  // BRDG-474: the change(s) that post-date the draft, for the "changed since" note and
  // its tooltip. A non-null timestamp means that source moved after generation; the
  // matching *By carries who did it (when known). Both null on a fresh or legacy draft.
  testDocStaleStoryAt: string | null;
  testDocStaleStoryBy: string | null;
  testDocStaleCommentAt: string | null;
  testDocStaleCommentBy: string | null;
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

  // Coarse date-prefix pre-filter (format-agnostic); JS refines to the exact 24h window.
  // Used by the deploy reason (below) and the what's-new comment/version aggregation.
  const floorDate = new Date(nowMs - WINDOW_MS).toISOString().slice(0, 10);
  const cutoff = nowMs - WINDOW_MS;

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

  // BRDG-446: a row also surfaces when an in-flight ticket got a fresh UAT deploy with no
  // unseen status change. UAT == Bitbucket environmentType "Staging" (covers UAT1/2/3); only
  // SUCCESSFUL deploys, and only within the SAME recency window as the comment/version
  // signals (the status change itself is not window-bounded, but a deploy must be — otherwise
  // every in-flight ticket would light up on its last deploy). A deploy attributed to several
  // tickets (ticketKeys, BRDG-269) surfaces on each in-scope key independently.
  const deployRows = await db
    .select({
      id: pipelineRun.id,
      ticketKey: pipelineRun.ticketKey,
      ticketKeys: pipelineRun.ticketKeys,
      environment: pipelineRun.environment,
      completedAt: pipelineRun.completedAt,
      state: pipelineRun.state,
    })
    .from(pipelineRun)
    .where(
      and(
        eq(pipelineRun.isDeployment, true),
        eq(pipelineRun.environmentType, "Staging"),
        eq(pipelineRun.state, "SUCCESSFUL"),
        isNotNull(pipelineRun.environment),
        isNotNull(pipelineRun.completedAt),
        sql`substr(${pipelineRun.completedAt}, 1, 10) >= ${floorDate}`,
      ),
    )
    .orderBy(desc(pipelineRun.completedAt));

  const scopeSet = new Set(ticketKeys);
  // Latest in-window UAT deploy per in-scope ticket key (rows are already newest-first).
  const latestDeployByKey = new Map<string, { pipelineRunId: string; environment: string; completedAt: string; state: string }>();
  for (const row of deployRows) {
    if (!row.completedAt || parseDbTime(row.completedAt) < cutoff) continue;
    const keysForRow = new Set<string>();
    if (row.ticketKey) keysForRow.add(row.ticketKey);
    if (row.ticketKeys) {
      try {
        for (const k of JSON.parse(row.ticketKeys) as string[]) keysForRow.add(k);
      } catch {
        // Malformed JSON: fall back to the primary key already added.
      }
    }
    for (const key of keysForRow) {
      if (!scopeSet.has(key) || latestDeployByKey.has(key)) continue;
      latestDeployByKey.set(key, {
        pipelineRunId: row.id,
        environment: row.environment ?? "",
        completedAt: row.completedAt,
        state: row.state,
      });
    }
  }

  // In-flight gate: deploy-only keys are absent from latestByKey, so their status is unknown
  // here. Fetch the candidates' status and drop any not actively in flight (Test / In Progress).
  const deployCandidateKeys = [...latestDeployByKey.keys()];
  if (deployCandidateKeys.length > 0) {
    const statusRows = await db
      .select({ jiraKey: ticket.jiraKey, status: ticket.status })
      .from(ticket)
      .where(and(inArray(ticket.jiraKey, deployCandidateKeys), isNull(ticket.removedFromJiraAt)));
    const statusByKey = new Map(statusRows.map((r) => [r.jiraKey, r.status]));
    for (const key of deployCandidateKeys) {
      if (!isInFlightStatus(statusByKey.get(key))) latestDeployByKey.delete(key);
    }
  }

  // Unseen gate: a deploy line is dismissed via its synthesized per-ticket seen-key.
  const remainingDeployKeys = [...latestDeployByKey.keys()];
  if (remainingDeployKeys.length > 0) {
    const seenKeys = remainingDeployKeys.map((key) => deploySeenKey(key, latestDeployByKey.get(key)!.pipelineRunId));
    const seenRows = await db
      .select({ statusChangeId: statusChangeSeen.statusChangeId })
      .from(statusChangeSeen)
      .where(and(eq(statusChangeSeen.userId, ctx.userId), inArray(statusChangeSeen.statusChangeId, seenKeys)));
    const seenSet = new Set(seenRows.map((r) => r.statusChangeId));
    for (const key of remainingDeployKeys) {
      if (seenSet.has(deploySeenKey(key, latestDeployByKey.get(key)!.pipelineRunId))) latestDeployByKey.delete(key);
    }
  }

  // BRDG-471: a state-driven fourth reason — a test-doc DRAFT awaiting acceptance
  // (a draft cached, no accepted doc). Mirrors deriveTestDocState's "draft" branch
  // exactly (testDoc falsy, testDocDraft truthy). Unlike the reasons above it has
  // NO seen-key: it is not dismissible and persists until the draft is accepted or
  // the ticket is marked not-needed (both clear testDocDraft / set testDoc). So a
  // dismissed status line collapses to this standalone "please review" line (BRDG-474).
  const draftRows = await db
    .select({ ticketKey: ticketMetadata.jiraKey, generatedAt: ticketMetadata.testDocDraftGeneratedAt })
    .from(ticketMetadata)
    .innerJoin(ticket, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        inArray(ticketMetadata.jiraKey, ticketKeys),
        sql`${ticketMetadata.testDocDraft} is not null and ${ticketMetadata.testDocDraft} != ''`,
        sql`(${ticketMetadata.testDoc} is null or ${ticketMetadata.testDoc} = '')`,
        isNull(ticket.removedFromJiraAt),
      ),
    );
  const draftReadyByKey = new Map<string, string | null>();
  for (const r of draftRows) draftReadyByKey.set(r.ticketKey, r.generatedAt);

  // BRDG-474: is a pending draft now stale? Compare its generation instant against
  // the ticket's LATEST story edit / comment. Unlike the "what's new" clause this is
  // deliberately NOT 24h-bounded and NOT self-excluded: a test doc is generated from
  // the story + comments, so any later change (including the PO's own) can make the
  // draft out of date. Only assessable when the generation instant is known.
  const draftKeys = [...draftReadyByKey.keys()];
  const staleStoryByKey = new Map<string, { at: string; by: string | null }>();
  const staleCommentByKey = new Map<string, { at: string; by: string | null }>();
  if (draftKeys.length > 0) {
    // The latest story edit / comment per draft key (rows newest-first; take the first).
    // If that latest change post-dates generation it IS the staling change, so it also
    // supplies the who/when for the note's tooltip.
    const storyRows = await db
      .select({ jiraKey: storyVersion.jiraKey, createdAt: storyVersion.createdAt, updatedBy: storyVersion.updatedBy })
      .from(storyVersion)
      .where(inArray(storyVersion.jiraKey, draftKeys))
      .orderBy(desc(storyVersion.createdAt));
    const commentRows = await db
      .select({ ticketKey: jiraComment.ticketKey, createdAt: jiraComment.createdAt, authorName: jiraComment.authorName })
      .from(jiraComment)
      .where(inArray(jiraComment.ticketKey, draftKeys))
      .orderBy(desc(jiraComment.createdAt));
    const latestStory = new Map<string, (typeof storyRows)[number]>();
    for (const r of storyRows) if (!latestStory.has(r.jiraKey)) latestStory.set(r.jiraKey, r);
    const latestComment = new Map<string, (typeof commentRows)[number]>();
    for (const r of commentRows) if (!latestComment.has(r.ticketKey)) latestComment.set(r.ticketKey, r);
    for (const key of draftKeys) {
      const gen = draftReadyByKey.get(key);
      if (!gen) continue;
      const genMs = parseDbTime(gen);
      const s = latestStory.get(key);
      if (s && parseDbTime(s.createdAt) > genMs) staleStoryByKey.set(key, { at: s.createdAt, by: s.updatedBy });
      const c = latestComment.get(key);
      if (c && parseDbTime(c.createdAt) > genMs) staleCommentByKey.set(key, { at: c.createdAt, by: c.authorName });
    }
  }

  // A ticket gets a line if it has an unseen status change OR sprint-add OR fresh UAT
  // deploy OR a test-doc draft awaiting acceptance.
  const keys = [
    ...new Set<string>([
      ...latestByKey.keys(),
      ...latestSprintByKey.keys(),
      ...latestDeployByKey.keys(),
      ...draftReadyByKey.keys(),
    ]),
  ];
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
    const d = latestDeployByKey.get(key);
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
      // Deploy-only line: fall back to the deploy time; draft-only line: the draft's
      // generation time. Keeps the row from ever being timeless.
      changedAt: s?.changedAt ?? sa?.changedAt ?? d?.completedAt ?? draftReadyByKey.get(key) ?? "",
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
      deployAdded: d
        ? {
            id: deploySeenKey(key, d.pipelineRunId),
            environment: d.environment,
            completedAt: d.completedAt,
            state: d.state,
          }
        : null,
      testDocReady: draftReadyByKey.has(key),
      testDocGeneratedAt: draftReadyByKey.get(key) ?? null,
      testDocStaleStoryAt: staleStoryByKey.get(key)?.at ?? null,
      testDocStaleStoryBy: staleStoryByKey.get(key)?.by ?? null,
      testDocStaleCommentAt: staleCommentByKey.get(key)?.at ?? null,
      testDocStaleCommentBy: staleCommentByKey.get(key)?.by ?? null,
    };
  });
}
