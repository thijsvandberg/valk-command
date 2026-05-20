import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion, ticketAttachment, ticketSubtask, ticketLink, jiraComment, sprintNameCache, ticketStatusChange } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { jiraClient, extractStoryPoints, extractEpicLink, extractAcceptanceCriteria, FLAGGED_FIELD, type JiraIssue, type JiraAttachment } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { createHash } from "crypto";

export function normalizeIssueType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bug")) return "bug";
  if (lower.includes("sub")) return "subtask";
  if (lower.includes("story")) return "story";
  if (lower.includes("spike")) return "spike";
  if (lower.includes("epic")) return "epic";
  return "task";
}

export function normalizeStatus(name: string): string {
  const upper = name.toUpperCase();
  if (upper === "TO DO" || upper === "BACKLOG" || upper === "OPEN") return "TO DO";
  if (upper.includes("PROGRESS")) return "IN PROGRESS";
  if (upper === "TEST" || upper === "IN REVIEW" || upper === "REVIEW") return "TEST";
  if (upper === "DONE" || upper === "CLOSED" || upper === "RESOLVED") return "DONE";
  return upper;
}

function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

export function cacheSprintName(sprintId: string, displayName: string) {
  if (!sprintId || !displayName) return;
  db.insert(sprintNameCache)
    .values({ sprintId, displayName })
    .onConflictDoUpdate({ target: sprintNameCache.sprintId, set: { displayName } })
    .run();
}

export async function upsertIssue(issue: JiraIssue, sprintName: string, _signal?: AbortSignal, jiraRank?: number) {
  const fields = issue.fields;
  const storyPoints = extractStoryPoints(fields);
  const epicData = extractEpicLink(fields);
  const epicValue = epicData?.name ?? null;
  const epicKeyValue = epicData?.key ?? null;
  const ac = extractAcceptanceCriteria(fields);
  const assigneeName = fields.assignee?.displayName ?? null;
  const assigneeAvatar = fields.assignee?.avatarUrls?.["48x48"] ?? null;
  const reporterName = fields.reporter?.displayName ?? null;
  const priority = fields.priority?.name ?? null;
  const componentsArr = fields.components ?? [];
  const componentsJson = componentsArr.length > 0
    ? JSON.stringify(componentsArr.map((c) => c.name))
    : null;

  const descriptionMarkdown = typeof fields.description === "string"
    ? fields.description
    : adfToMarkdown(fields.description);

  const now = new Date().toISOString();

  // Pre-read: gather current DB state outside the write transaction
  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, issue.key),
  });
  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, issue.key),
  });
  const hash = contentHash(fields.description, ac);
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, issue.key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  // HTTP call: fetch change author outside the transaction to avoid holding the write lock
  const needsNewVersion = !latestVersion || latestVersion.contentHash !== hash;
  const changeAuthor = needsNewVersion && latestVersion
    ? await jiraClient.getLastChangeAuthor(issue.key, _signal)
    : null;

  const attachments: JiraAttachment[] = issue.fields.attachment ?? [];
  const existingAttachments = new Map(
    (await db
      .select({ id: ticketAttachment.id, jiraAttachmentId: ticketAttachment.jiraAttachmentId, jiraUrl: ticketAttachment.jiraUrl })
      .from(ticketAttachment)
      .where(eq(ticketAttachment.ticketKey, issue.key))
      .all()
    ).map((a) => [a.jiraAttachmentId, a]),
  );

  const issuelinks = fields.issuelinks ?? [];
  const localLinks = await db
    .select({ id: ticketLink.id, linkedKey: ticketLink.linkedKey })
    .from(ticketLink)
    .where(
      and(eq(ticketLink.ticketKey, issue.key), isNull(ticketLink.jiraLinkId)),
    )
    .all();
  const localLinkMap = new Map(localLinks.map((l) => [l.linkedKey, l.id]));

  const inlineComments = fields.comment?.comments ?? [];
  const existingCommentIds = new Set(
    (await db
      .select({ jiraCommentId: jiraComment.jiraCommentId })
      .from(jiraComment)
      .where(eq(jiraComment.ticketKey, issue.key))
      .all()
    ).map((c) => c.jiraCommentId),
  );

  const ticketData = {
    jiraKey: issue.key,
    jiraId: issue.id,
    title: fields.summary,
    type: normalizeIssueType(fields.issuetype.name),
    status: normalizeStatus(fields.status.name),
    assignee: assigneeName,
    assigneeAvatar,
    epic: epicValue,
    epicKey: epicKeyValue,
    flagged: (() => {
      const raw = (fields as unknown as Record<string, unknown>)[FLAGGED_FIELD];
      return Array.isArray(raw) ? raw.length > 0 : Boolean(raw);
    })(),
    reporter: reporterName,
    description: descriptionMarkdown || null,
    acceptanceCriteria: ac,
    storyPoints,
    sprintName,
    labels: fields.labels.length > 0 ? JSON.stringify(fields.labels) : null,
    priority,
    components: componentsJson,
    ...(jiraRank !== undefined ? { jiraRank } : {}),
    jiraCreatedAt: fields.created ?? null,
    jiraUpdatedAt: fields.updated ?? null,
    lastSyncedAt: now,
  };

  // Detect story points change for auto-transition (checked before the transaction)
  const pointsChanged = !!existing && existing.storyPoints !== storyPoints;
  const statusChanged = existing && existing.status !== ticketData.status;

  // All DB writes in a single transaction for SQLite performance
  db.transaction((tx) => {
    // Ticket upsert
    if (existing) {
      tx.update(ticket).set(ticketData).where(eq(ticket.jiraKey, issue.key)).run();
    } else {
      tx.insert(ticket).values(ticketData).run();
    }

    // Record status transition for burnup chart
    if (statusChanged) {
      tx.insert(ticketStatusChange).values({
        id: `sc-${issue.key}-${Date.now()}`,
        ticketKey: issue.key,
        fromStatus: existing!.status,
        toStatus: ticketData.status,
        changedAt: fields.updated ?? now,
        sprintName,
      }).run();
    }

    // Metadata
    if (!meta) {
      // New ticket: start in drafting state so the PO knows to prepare it
      tx.insert(ticketMetadata).values({ jiraKey: issue.key, readiness: "drafting" }).run();
    } else if (pointsChanged && meta.readiness !== "waiting_for_feedback") {
      // Story points added/changed: clear readiness to signal it is ready for development.
      // Skip if currently waiting for feedback — that state takes priority.
      tx.update(ticketMetadata).set({ readiness: null }).where(eq(ticketMetadata.jiraKey, issue.key)).run();
    }

    // Story version
    if (needsNewVersion) {
      tx.insert(storyVersion).values({
        id: `sv-${issue.key}-${Date.now()}`,
        jiraKey: issue.key,
        description: descriptionMarkdown || JSON.stringify(fields.description ?? ""),
        acceptanceCriteria: ac,
        contentHash: hash,
        updatedBy: changeAuthor?.name ?? null,
        updatedByAvatar: changeAuthor?.avatar ?? null,
      }).run();
    }

    // Attachments
    for (const att of attachments) {
      const existingAtt = existingAttachments.get(att.id);
      if (!existingAtt) {
        tx.insert(ticketAttachment).values({
          id: `att-${att.id}`,
          ticketKey: issue.key,
          jiraAttachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          jiraUrl: att.content ?? null,
        }).run();
      } else if (!existingAtt.jiraUrl && att.content) {
        tx.update(ticketAttachment)
          .set({ jiraUrl: att.content })
          .where(eq(ticketAttachment.id, existingAtt.id))
          .run();
      }
    }

    // Subtasks: replace all
    tx.delete(ticketSubtask).where(eq(ticketSubtask.ticketKey, issue.key)).run();
    const subtasks = fields.subtasks ?? [];
    for (const sub of subtasks) {
      tx.insert(ticketSubtask).values({
        id: `sub-${issue.key}-${sub.key}`,
        ticketKey: issue.key,
        subtaskKey: sub.key,
        title: sub.fields.summary,
        type: normalizeIssueType(sub.fields.issuetype.name),
        status: normalizeStatus(sub.fields.status.name),
        assignee: sub.fields.assignee?.displayName ?? null,
        assigneeAvatar: sub.fields.assignee?.avatarUrls?.["48x48"] ?? null,
      }).run();
    }

    // Links: delete Jira-sourced, then upsert
    tx.delete(ticketLink).where(
      and(eq(ticketLink.ticketKey, issue.key), isNotNull(ticketLink.jiraLinkId)),
    ).run();
    for (const link of issuelinks) {
      const linked = link.inwardIssue ?? link.outwardIssue;
      if (!linked) continue;
      const relation = link.inwardIssue ? link.type.inward : link.type.outward;
      const localLinkId = localLinkMap.get(linked.key);

      const linkData = {
        jiraLinkId: link.id,
        relation,
        title: linked.fields.summary,
        type: normalizeIssueType(linked.fields.issuetype.name),
        status: normalizeStatus(linked.fields.status.name),
        assignee: linked.fields.assignee?.displayName ?? null,
        assigneeAvatar: linked.fields.assignee?.avatarUrls?.["48x48"] ?? null,
      };

      if (localLinkId) {
        tx.update(ticketLink).set(linkData).where(eq(ticketLink.id, localLinkId)).run();
      } else {
        tx.insert(ticketLink).values({
          id: `link-${issue.key}-${link.id}`,
          ticketKey: issue.key,
          linkedKey: linked.key,
          ...linkData,
        }).run();
      }
    }

    // Comments
    for (const comment of inlineComments) {
      const contentMarkdown = typeof comment.body === "string"
        ? comment.body
        : adfToMarkdown(comment.body);
      const authorName = comment.author?.displayName ?? "Unknown";
      const authorAvatar = comment.author?.avatarUrls?.["48x48"] ?? null;

      if (existingCommentIds.has(comment.id)) {
        tx.update(jiraComment)
          .set({ content: contentMarkdown, authorName, authorAvatar })
          .where(eq(jiraComment.jiraCommentId, comment.id))
          .run();
      } else {
        tx.insert(jiraComment).values({
          id: `jc-${comment.id}`,
          ticketKey: issue.key,
          jiraCommentId: comment.id,
          authorName,
          authorAvatar,
          content: contentMarkdown,
          createdAt: comment.created,
        }).run();
      }
    }
  });

  return {
    key: issue.key,
    type: normalizeIssueType(fields.issuetype.name),
    epic: epicValue,
    epicKey: epicKeyValue,
    flagged: (() => {
      const raw = (fields as unknown as Record<string, unknown>)[FLAGGED_FIELD];
      return Array.isArray(raw) ? raw.length > 0 : Boolean(raw);
    })(),
    assigneeColor: assigneeName ? userColor(assigneeName) : null,
  };
}
