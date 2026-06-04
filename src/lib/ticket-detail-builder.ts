import { db } from "@/db";
import { ticket, ticketLocalEdit, jiraComment, ticketSubtask, storedReview, storyVersion, conversation, message, subtaskSuggestion, sprintNameCache, ticketMetadata } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import type { Ticket, TicketDetail, IssueType, JiraStatus, POStatus, TicketReadiness, Assignee, Attachment, JiraComment, Subtask, EpicChild, LinkedIssue } from "@/types/ticket";
import { computeTicketEditState } from "@/lib/ticket-state";
import { timedQuery } from "@/lib/query-timer";
import { jiraClient, STORY_POINTS_FIELD, FLAGGED_FIELD, extractSprint } from "@/lib/jira-client";
import { upsertIssue } from "@/lib/upsert-issue";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { userInitials, userColor } from "@/lib/user-utils";

export function buildAssignee(name: string | null): Assignee | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name) };
}

export function attachmentColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "#4a90d9";
  if (mimeType === "application/pdf") return "#e5534b";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "#4aaa60";
  return "#94a3b8";
}

export function resolveAttachmentRefs(text: string, filenameToId: Map<string, string>): string {
  // Markdown image syntax from ADF conversion
  let resolved = text.replace(
    /!\[([^\]]*)\]\(attachment[^)]*\)/g,
    (_match, alt: string) => {
      const id = filenameToId.get(alt);
      return id ? `![${alt}](/api/attachments/${id})` : `![${alt}](attachment)`;
    },
  );
  // Jira wiki markup format: !filename.png! or !filename.png|thumbnail!
  resolved = resolved.replace(
    /(?<![[\w])!([^|\n!]+\.[a-z]{2,5})(?:\|[^!\n]*)?!(?![[\w])/gi,
    (_match, filename: string) => {
      const id = filenameToId.get(filename);
      return id ? `![${filename}](/api/attachments/${id})` : `![${filename}](attachment)`;
    },
  );
  return resolved;
}

export interface TicketDetailResponse extends Omit<Ticket, "reporter">, TicketDetail {
  localEdits: Record<string, { value: string; isDraft: boolean }>;
  reviewCount: number;
  versionCount: number;
  chatMessageCount: number;
  pendingSuggestionCount: number;
  currentVersionHash: string | null;
}

async function runTicketQueries(key: string) {
  const [t, meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion, parentRows, reviewCountRows, versionCountRows, chatCountRows, suggestionCountRows] = await Promise.all([
    db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    }),
    db.query.ticketMetadata.findFirst({
      where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
    }),
    db.query.ticketAttachment.findMany({
      where: (a, { eq: eqFn }) => eqFn(a.ticketKey, key),
    }),
    db.query.jiraComment.findMany({
      where: (c, { eq: eqFn }) => eqFn(c.ticketKey, key),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    }),
    db.query.ticketSubtask.findMany({
      where: (s, { eq: eqFn }) => eqFn(s.ticketKey, key),
    }),
    db.query.ticketLink.findMany({
      where: (l, { eq: eqFn }) => eqFn(l.ticketKey, key),
    }),
    db.query.ticket.findMany({
      where: (row, { eq: eqFn }) => eqFn(row.epicKey, key),
      // Rank order drives the epic's by-sprint view; unranked rows sort last, with
      // a deterministic jiraKey tiebreaker so the order is reproducible.
      orderBy: (row, { asc, sql: sqlFn }) => [sqlFn`${row.jiraRank} IS NULL`, asc(row.jiraRank), asc(row.jiraKey)],
    }),
    db.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, key)),
    db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
    }),
    db.select({
      ticketKey: ticketSubtask.ticketKey,
      title: ticket.title,
      status: ticket.status,
      type: ticket.type,
    }).from(ticketSubtask)
      .innerJoin(ticket, eq(ticket.jiraKey, ticketSubtask.ticketKey))
      .where(eq(ticketSubtask.subtaskKey, key))
      .limit(1),
    db.select({ value: count() }).from(storedReview).where(eq(storedReview.ticketKey, key)),
    db.select({ value: count() }).from(storyVersion).where(eq(storyVersion.jiraKey, key)),
    db.select({ value: count() }).from(message).innerJoin(conversation, eq(message.conversationId, conversation.id)).where(eq(conversation.relatedTicket, key)),
    db.select({ value: count() }).from(subtaskSuggestion).where(eq(subtaskSuggestion.ticketKey, key)),
  ]);

  if (!t) return null;

  const parentTicket = parentRows.length > 0
    ? {
        key: parentRows[0].ticketKey,
        title: parentRows[0].title,
        status: (parentRows[0].status ?? "TO DO") as import("@/types/ticket").JiraStatus,
        type: (parentRows[0].type ?? "task") as import("@/types/ticket").IssueType,
      }
    : null;

  return { t, meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion, parentTicket, reviewCountRows, versionCountRows, chatCountRows, suggestionCountRows };
}

function transformQueryData(queryData: NonNullable<Awaited<ReturnType<typeof runTicketQueries>>>): TicketDetailResponse {
  const { t, meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion, parentTicket, reviewCountRows, versionCountRows, chatCountRows, suggestionCountRows } = queryData;

  const attachments: Attachment[] = attachmentRows.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.downloadedAt ?? new Date().toISOString(),
    color: attachmentColor(a.mimeType),
    cleaned: Boolean(a.cleanedAt),
    cleanedAt: a.cleanedAt ?? null,
  }));

  let labels: string[] = [];
  let components: string[] = [];
  try { labels = t.labels ? JSON.parse(t.labels) : []; } catch { logger.warn("ticket-detail", `malformed labels JSON: ${t.labels}`); }
  try { components = t.components ? JSON.parse(t.components) : []; } catch { logger.warn("ticket-detail", `malformed components JSON: ${t.components}`); }

  const editState = computeTicketEditState(localEdits, latestVersion?.contentHash ?? null);

  const ticketBase: Ticket = {
    key: t.jiraKey,
    title: t.title,
    type: (t.type ?? "task") as IssueType,
    epic: t.epic ?? null,
    epicKey: t.epicKey ?? null,
    jiraStatus: (t.status ?? "TO DO") as JiraStatus,
    storyPoints: t.storyPoints ?? null,
    assignee: buildAssignee(t.assignee),
    flagged: t.flagged ?? false,
    readiness: (meta?.readiness ?? null) as TicketReadiness | null,
    poStatus: (meta?.poStatus ?? null) as POStatus,
    qualityScore: meta?.qualityScore ?? null,
    businessValue: meta?.businessValue ?? null,
    editState,
    notes: meta?.poNotes ?? "",
    sprintId: t.sprintName ?? undefined,
    removedFromJiraAt: t.removedFromJiraAt ?? null,
  };

  const subtasks: Subtask[] = subtaskRows.map((s) => ({
    key: s.subtaskKey,
    title: s.title,
    type: (s.type ?? "subtask") as IssueType,
    jiraStatus: (s.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(s.assignee),
  }));

  const linkedIssues: LinkedIssue[] = linkRows.map((l) => ({
    jiraLinkId: l.jiraLinkId ?? undefined,
    relation: l.relation,
    key: l.linkedKey,
    title: l.title,
    type: (l.type ?? "task") as IssueType,
    jiraStatus: (l.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(l.assignee),
  }));

  const filenameToId = new Map(attachmentRows.map((a) => [a.filename, a.id]));

  const rawDescription = t.description ?? "";
  const description = resolveAttachmentRefs(rawDescription, filenameToId);

  const jiraComments: JiraComment[] = jiraCommentRows.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    authorAvatar: c.authorAvatar ?? null,
    authorInitials: userInitials(c.authorName),
    authorColor: userColor(c.authorName),
    content: resolveAttachmentRefs(c.content, filenameToId),
    createdAt: c.createdAt,
  }));

  // Build subtask counts and resolve sprint names for epic children
  const epicChildren: EpicChild[] = [];

  return {
    ...ticketBase,
    description,
    reporter: buildAssignee(t.reporter),
    parent: parentTicket,
    labels,
    components,
    priority: (t.priority ?? "Medium") as TicketDetail["priority"],
    createdAt: t.jiraCreatedAt ?? t.lastSyncedAt ?? new Date().toISOString(),
    updatedAt: t.jiraUpdatedAt ?? t.lastSyncedAt ?? new Date().toISOString(),
    attachments,
    subtasks,
    linkedIssues,
    jiraComments,
    epicChildren,
    localEdits: Object.fromEntries(localEdits.map((edit) => [edit.field, { value: edit.localValue, isDraft: edit.isDraft }])),
    reviewCount: reviewCountRows[0]?.value ?? 0,
    versionCount: versionCountRows[0]?.value ?? 0,
    chatMessageCount: chatCountRows[0]?.value ?? 0,
    pendingSuggestionCount: suggestionCountRows[0]?.value ?? 0,
    currentVersionHash: latestVersion?.contentHash ?? null,
  };
}

async function resolveEpicChildren(epicChildRows: Awaited<ReturnType<typeof runTicketQueries>> extends null ? never : NonNullable<Awaited<ReturnType<typeof runTicketQueries>>>["epicChildRows"]): Promise<EpicChild[]> {
  const epicChildKeys = epicChildRows.map((c) => c.jiraKey);
  const subtaskCountMap = new Map<string, number>();
  const sprintIdToName = new Map<string, string>();
  const readinessMap = new Map<string, TicketReadiness | null>();
  const businessValueMap = new Map<string, number | null>();

  if (epicChildKeys.length > 0) {
    const [subtaskCountResult, metaRows] = await Promise.all([
      db
        .select({ ticketKey: ticketSubtask.ticketKey, total: count() })
        .from(ticketSubtask)
        .where(sql`${ticketSubtask.ticketKey} IN (${sql.join(epicChildKeys.map((k) => sql`${k}`), sql`, `)})`)
        .groupBy(ticketSubtask.ticketKey),
      db.query.ticketMetadata.findMany({
        where: (m, { sql: sqlFn }) => sqlFn`${m.jiraKey} IN (${sql.join(epicChildKeys.map((k) => sql`${k}`), sql`, `)})`,
      }),
    ]);
    for (const row of subtaskCountResult) {
      subtaskCountMap.set(row.ticketKey, row.total);
    }
    for (const row of metaRows) {
      readinessMap.set(row.jiraKey, (row.readiness as TicketReadiness) ?? null);
      businessValueMap.set(row.jiraKey, row.businessValue ?? null);
    }

    const sprintIds = [...new Set(epicChildRows.map((c) => c.sprintName).filter(Boolean))] as string[];
    if (sprintIds.length > 0) {
      const sprintNameRows = await db
        .select({ sprintId: sprintNameCache.sprintId, displayName: sprintNameCache.displayName })
        .from(sprintNameCache)
        .where(sql`${sprintNameCache.sprintId} IN (${sql.join(sprintIds.map((id) => sql`${id}`), sql`, `)})`);
      for (const row of sprintNameRows) {
        sprintIdToName.set(row.sprintId, row.displayName);
      }
    }
  }

  return epicChildRows.map((c) => ({
    key: c.jiraKey,
    title: c.title,
    type: (c.type ?? "task") as IssueType,
    jiraStatus: (c.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(c.assignee),
    storyPoints: c.storyPoints ?? null,
    businessValue: businessValueMap.get(c.jiraKey) ?? null,
    sprintName: c.sprintName ? (sprintIdToName.get(c.sprintName) ?? c.sprintName) : null,
    subtaskCount: subtaskCountMap.get(c.jiraKey) ?? 0,
    readiness: readinessMap.get(c.jiraKey) ?? null,
    jiraRank: c.jiraRank ?? null,
  }));
}

/**
 * Builds the full ticket detail response, including on-demand Jira fetch.
 * Returns { data, durationMs } or null if not found.
 */
export async function buildTicketDetail(key: string): Promise<{ data: TicketDetailResponse; durationMs: number } | null> {
  let { result: queryData, durationMs } = await timedQuery(`GET /api/tickets/${key}`, () => runTicketQueries(key));

  if (!queryData) {
    try {
      const jiraIssue = await jiraClient.getIssue(key);
      const sprint = extractSprint(jiraIssue.fields);
      await upsertIssue(jiraIssue, sprint?.name ?? "__on_demand__");

      const { result: retryData } = await timedQuery(`GET /api/tickets/${key} (after Jira fetch)`, () => runTicketQueries(key));
      if (retryData) {
        queryData = retryData;
      }
    } catch (err) {
      logger.warn("ticket-detail", `On-demand Jira fetch failed for ${key}:`, err);
    }

    if (!queryData) return null;
  }

  const response = transformQueryData(queryData);

  if (queryData.epicChildRows.length > 0) {
    response.epicChildren = await resolveEpicChildren(queryData.epicChildRows);
  }

  return { data: response, durationMs };
}

// PATCH logic

const VALID_ISSUE_TYPES: IssueType[] = ["story", "bug", "task", "spike"];

const JIRA_TYPE_NAMES: Partial<Record<IssueType, string>> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

export async function updateTicketFields(key: string, body: Record<string, unknown>): Promise<{ result: Record<string, unknown> } | { error: string; status: number }> {
  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return { error: "Ticket not found", status: 404 };
  }

  const result: Record<string, unknown> = {};

  if (body.type !== undefined) {
    if (!VALID_ISSUE_TYPES.includes(body.type as IssueType)) {
      return { error: `type must be one of: ${VALID_ISSUE_TYPES.join(", ")}`, status: 400 };
    }

    const newType = body.type as IssueType;
    await db.update(ticket).set({ type: newType }).where(eq(ticket.jiraKey, key));

    const jiraName = JIRA_TYPE_NAMES[newType];
    if (jiraName) {
      jiraClient.updateIssue(key, { issuetype: { name: jiraName } })
        .then(() => syncJiraTimestamp(key))
        .catch((err: unknown) => {
          logger.error("ticket-detail", `PATCH Jira type sync failed for ${key}:`, err);
        });
    }

    await logActivity({ type: "metadata-update", scope: key, summary: `Changed issue type to ${newType}` });
    result.type = newType;
  }

  if (body.storyPoints !== undefined) {
    const raw = body.storyPoints;
    if (raw !== null && (typeof raw !== "number" || raw < 0)) {
      return { error: "storyPoints must be null or a non-negative number", status: 400 };
    }

    const spValue = raw as number | null;
    await db.update(ticket).set({ storyPoints: spValue }).where(eq(ticket.jiraKey, key));

    const jiraValue = spValue != null && spValue > 0 ? spValue : null;
    jiraClient.updateIssue(key, { [STORY_POINTS_FIELD]: jiraValue })
      .then(() => syncJiraTimestamp(key))
      .catch((err: unknown) => {
        logger.error("ticket-detail", `PATCH Jira SP sync failed for ${key}:`, err);
      });

    await logActivity({ type: "metadata-update", scope: key, summary: `Changed story points to ${spValue ?? "unset"}` });
    result.storyPoints = spValue;
  }

  if (body.epicKey !== undefined) {
    const rawEpic = body.epicKey;
    if (rawEpic !== null && (typeof rawEpic !== "string" || !rawEpic.trim())) {
      return { error: "epicKey must be null or a non-empty string", status: 400 };
    }

    const epicKey = rawEpic as string | null;
    let epicName: string | null = null;

    if (epicKey) {
      const epicTicket = await db.query.ticket.findFirst({
        where: (row, { eq: eqFn }) => eqFn(row.jiraKey, epicKey),
      });
      epicName = epicTicket?.title ?? epicKey;
    }

    await db.update(ticket).set({ epic: epicName, epicKey }).where(eq(ticket.jiraKey, key));

    jiraClient.updateIssue(key, { parent: epicKey ? { key: epicKey } : null })
      .then(() => syncJiraTimestamp(key))
      .catch((err: unknown) => {
        logger.error("ticket-detail", `PATCH Jira epic sync failed for ${key}:`, err);
      });

    await logActivity({ type: "metadata-update", scope: key, summary: `Changed epic to ${epicKey ?? "none"}` });
    result.epic = epicName;
    result.epicKey = epicKey;
  }

  if (body.flagged !== undefined) {
    if (typeof body.flagged !== "boolean") {
      return { error: "flagged must be a boolean", status: 400 };
    }

    const newFlagged = body.flagged;
    const flagReason = typeof body.flagReason === "string" ? body.flagReason.trim().slice(0, 2000) : "";

    await db.update(ticket).set({ flagged: newFlagged }).where(eq(ticket.jiraKey, key));

    const flagType = newFlagged ? "flag_on" as const : "flag_off" as const;

    if (flagReason) {
      const flagLabel = newFlagged ? "Flag added" : "Flag removed";
      await db.insert(jiraComment).values({
        id: `jc-local-${Date.now()}`,
        ticketKey: key,
        authorName: "Bridge",
        content: `:${flagType}: ${flagLabel}\n\n${flagReason}`,
        createdAt: new Date().toISOString(),
      });
    }

    (async () => {
      try {
        await jiraClient.updateIssue(key, {
          [FLAGGED_FIELD]: newFlagged ? [{ value: "Impediment" }] : [],
        });
        await syncJiraTimestamp(key);
      } catch (err) {
        logger.error("ticket-detail", `PATCH Jira flag sync failed for ${key}:`, err);
      }
      if (flagReason) {
        try {
          await jiraClient.addFlagComment(key, flagType, flagReason);
        } catch (err) {
          logger.error("ticket-detail", `PATCH Jira flag comment failed for ${key}:`, err);
        }
      }
    })();

    await logActivity({ type: "metadata-update", scope: key, summary: newFlagged ? "Flagged ticket" : "Unflagged ticket" });
    result.flagged = newFlagged;
  }

  if (body.labels !== undefined) {
    if (!Array.isArray(body.labels) || !body.labels.every((l: unknown) => typeof l === "string")) {
      return { error: "labels must be an array of strings", status: 400 };
    }

    const labels: string[] = body.labels;
    await db.update(ticket).set({ labels: JSON.stringify(labels) }).where(eq(ticket.jiraKey, key));

    jiraClient.updateIssue(key, { labels })
      .then(() => syncJiraTimestamp(key))
      .catch((err: unknown) => {
        logger.error("ticket-detail", `PATCH Jira labels sync failed for ${key}:`, err);
      });

    await logActivity({ type: "metadata-update", scope: key, summary: `Updated labels` });
    result.labels = labels;
  }

  if (Object.keys(result).length === 0) {
    return { error: "No valid fields to update", status: 400 };
  }

  return { result };
}
