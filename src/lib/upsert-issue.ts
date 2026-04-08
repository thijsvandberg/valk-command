import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion, ticketAttachment, ticketSubtask, ticketLink, jiraComment } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { jiraClient, extractStoryPoints, extractEpicLink, extractAcceptanceCriteria, type JiraIssue, type JiraAttachment } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { createHash } from "crypto";

export function normalizeIssueType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bug")) return "bug";
  if (lower.includes("sub")) return "subtask";
  if (lower.includes("story")) return "story";
  if (lower.includes("spike")) return "spike";
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

export async function upsertIssue(issue: JiraIssue, sprintName: string, _signal?: AbortSignal) {
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

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, issue.key),
  });

  const ticketData = {
    jiraKey: issue.key,
    title: fields.summary,
    type: normalizeIssueType(fields.issuetype.name),
    status: normalizeStatus(fields.status.name),
    assignee: assigneeName,
    assigneeAvatar,
    epic: epicValue,
    epicKey: epicKeyValue,
    flagged: Boolean(fields.flagged),
    reporter: reporterName,
    description: descriptionMarkdown || null,
    acceptanceCriteria: ac,
    storyPoints,
    sprintName,
    labels: fields.labels.length > 0 ? JSON.stringify(fields.labels) : null,
    priority,
    components: componentsJson,
    jiraCreatedAt: fields.created ?? null,
    jiraUpdatedAt: fields.updated ?? null,
    lastSyncedAt: now,
  };

  if (existing) {
    await db.update(ticket).set(ticketData).where(eq(ticket.jiraKey, issue.key));
  } else {
    await db.insert(ticket).values(ticketData);
  }

  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, issue.key),
  });
  if (!meta) {
    await db.insert(ticketMetadata).values({ jiraKey: issue.key });
  }

  const hash = contentHash(fields.description, ac);
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, issue.key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  if (!latestVersion || latestVersion.contentHash !== hash) {
    const changeAuthor = latestVersion
      ? await jiraClient.getLastChangeAuthor(issue.key, _signal)
      : null;

    await db.insert(storyVersion).values({
      id: `sv-${issue.key}-${Date.now()}`,
      jiraKey: issue.key,
      description: descriptionMarkdown || JSON.stringify(fields.description ?? ""),
      acceptanceCriteria: ac,
      contentHash: hash,
      updatedBy: changeAuthor?.name ?? null,
      updatedByAvatar: changeAuthor?.avatar ?? null,
    });
  }

  const attachments: JiraAttachment[] = issue.fields.attachment ?? [];
  for (const att of attachments) {
    const existingAtt = await db.query.ticketAttachment.findFirst({
      where: (a, { eq: eqFn }) => eqFn(a.jiraAttachmentId, att.id),
    });
    if (!existingAtt) {
      await db.insert(ticketAttachment).values({
        id: `att-${att.id}`,
        ticketKey: issue.key,
        jiraAttachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        jiraUrl: att.content ?? null,
      });
    } else if (!existingAtt.jiraUrl && att.content) {
      await db.update(ticketAttachment)
        .set({ jiraUrl: att.content })
        .where(eq(ticketAttachment.id, existingAtt.id));
    }
  }

  await db.delete(ticketSubtask).where(eq(ticketSubtask.ticketKey, issue.key));
  const subtasks = fields.subtasks ?? [];
  for (const sub of subtasks) {
    await db.insert(ticketSubtask).values({
      id: `sub-${issue.key}-${sub.key}`,
      ticketKey: issue.key,
      subtaskKey: sub.key,
      title: sub.fields.summary,
      type: normalizeIssueType(sub.fields.issuetype.name),
      status: normalizeStatus(sub.fields.status.name),
      assignee: sub.fields.assignee?.displayName ?? null,
      assigneeAvatar: sub.fields.assignee?.avatarUrls?.["48x48"] ?? null,
    });
  }

  await db.delete(ticketLink).where(
    and(eq(ticketLink.ticketKey, issue.key), isNotNull(ticketLink.jiraLinkId)),
  );
  const issuelinks = fields.issuelinks ?? [];
  for (const link of issuelinks) {
    const linked = link.inwardIssue ?? link.outwardIssue;
    if (!linked) continue;
    const relation = link.inwardIssue ? link.type.inward : link.type.outward;

    const localLink = await db
      .select({ id: ticketLink.id })
      .from(ticketLink)
      .where(
        and(
          eq(ticketLink.ticketKey, issue.key),
          eq(ticketLink.linkedKey, linked.key),
          isNull(ticketLink.jiraLinkId),
        ),
      )
      .get();

    if (localLink) {
      await db.update(ticketLink)
        .set({
          jiraLinkId: link.id,
          relation,
          title: linked.fields.summary,
          type: normalizeIssueType(linked.fields.issuetype.name),
          status: normalizeStatus(linked.fields.status.name),
          assignee: linked.fields.assignee?.displayName ?? null,
          assigneeAvatar: linked.fields.assignee?.avatarUrls?.["48x48"] ?? null,
        })
        .where(eq(ticketLink.id, localLink.id));
    } else {
      await db.insert(ticketLink).values({
        id: `link-${issue.key}-${link.id}`,
        ticketKey: issue.key,
        jiraLinkId: link.id,
        relation,
        linkedKey: linked.key,
        title: linked.fields.summary,
        type: normalizeIssueType(linked.fields.issuetype.name),
        status: normalizeStatus(linked.fields.status.name),
        assignee: linked.fields.assignee?.displayName ?? null,
        assigneeAvatar: linked.fields.assignee?.avatarUrls?.["48x48"] ?? null,
      });
    }
  }

  const inlineComments = fields.comment?.comments ?? [];
  for (const comment of inlineComments) {
    const contentMarkdown = typeof comment.body === "string"
      ? comment.body
      : adfToMarkdown(comment.body);
    const authorName = comment.author?.displayName ?? "Unknown";
    const authorAvatar = comment.author?.avatarUrls?.["48x48"] ?? null;
    const existingComment = await db.query.jiraComment.findFirst({
      where: (c, { eq: eqFn }) => eqFn(c.jiraCommentId, comment.id),
    });
    if (existingComment) {
      await db.update(jiraComment)
        .set({ content: contentMarkdown, authorName, authorAvatar })
        .where(eq(jiraComment.jiraCommentId, comment.id));
    } else {
      await db.insert(jiraComment).values({
        id: `jc-${comment.id}`,
        ticketKey: issue.key,
        jiraCommentId: comment.id,
        authorName,
        authorAvatar,
        content: contentMarkdown,
        createdAt: comment.created,
      });
    }
  }

  return {
    key: issue.key,
    type: normalizeIssueType(fields.issuetype.name),
    epic: epicValue,
    epicKey: epicKeyValue,
    flagged: Boolean(fields.flagged),
    assigneeColor: assigneeName ? userColor(assigneeName) : null,
  };
}
