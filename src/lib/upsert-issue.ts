import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion, ticketAttachment, ticketSubtask, ticketLink, jiraComment, sprintNameCache, ticketStatusChange, storyWriterSession } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { jiraClient, extractStoryPoints, extractSprints, extractEpicLink, extractAcceptanceCriteria, extractLastChangeAuthor, FLAGGED_FIELD, type JiraIssue, type JiraAttachment } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { markdownEqualIgnoringSpacing } from "@/lib/normalize-markdown";
import { emitTicketEvent, type TicketChangeKind } from "@/lib/ticket-events";
import { syncTicketSprints } from "@/lib/sprint-membership";
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

export async function upsertIssue(
  issue: JiraIssue,
  sprintName: string,
  _signal?: AbortSignal,
  jiraRank?: number,
  pushAuthor?: { name: string | null; avatar: string | null } | null,
) {
  const fields = issue.fields;
  const extractedStoryPoints = extractStoryPoints(fields);
  // Record every sprint the issue belongs to so it shows in each sprint column.
  // The sprintName param remains the single primary sprint used for the card label.
  const sprintIdList = extractSprints(fields).map((s) => String(s.id));
  const sprintIdsJson = sprintIdList.length > 0 ? JSON.stringify(sprintIdList) : null;
  const epicData = extractEpicLink(fields);
  const epicValue = epicData?.name ?? null;
  const epicKeyValue = epicData?.key ?? null;
  const ac = extractAcceptanceCriteria(fields);
  const assigneeName = fields.assignee?.displayName ?? null;
  const assigneeAvatar = fields.assignee?.avatarUrls?.["48x48"] ?? null;
  const assigneeAccountId = fields.assignee?.accountId ?? null;
  const assigneeEmail = fields.assignee?.emailAddress ?? null;
  const reporterName = fields.reporter?.displayName ?? null;
  const reporterAccountId = fields.reporter?.accountId ?? null;
  const reporterAvatar = fields.reporter?.avatarUrls?.["48x48"] ?? null;
  const reporterEmail = fields.reporter?.emailAddress ?? null;
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

  // "-" (stored locally as 0) is a Bridge-only "not applicable" marker. Jira has
  // no concept of 0 story points, so a "-" ticket pushes an empty value to Jira;
  // a later sync reading that empty field back must not clobber the local 0 and
  // revert "-" to "?". A real (non-empty) Jira value still wins.
  const storyPoints = extractedStoryPoints == null && existing?.storyPoints === 0 ? 0 : extractedStoryPoints;
  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, issue.key),
  });
  const hash = contentHash(fields.description, ac);
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, issue.key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  // Determine who made the latest change. Prefer inline changelog (from expand=changelog)
  // to avoid an extra API call per issue. Fall back to a separate fetch only when
  // the issue was fetched without changelog expansion (e.g. single-issue views).
  const needsNewVersion = !latestVersion || latestVersion.contentHash !== hash;

  // A new version whose visible content already matches the local mirror is
  // the echo of Bridge's own push returning through sync (the push round-trips
  // through ADF, so the raw content hash still moves), not an external edit.
  // Record it for history, but keep open editors quiet and carry any active
  // Story Writer baseline along so the draft is not falsely flagged outdated.
  const isOwnPushEcho =
    needsNewVersion &&
    !!existing &&
    markdownEqualIgnoringSpacing(descriptionMarkdown ?? "", existing.description ?? "") &&
    (ac ?? "") === (existing.acceptanceCriteria ?? "");

  const changeAuthor = needsNewVersion && latestVersion
    ? (extractLastChangeAuthor(issue) ?? await jiraClient.getLastChangeAuthor(issue.key, _signal))
    : null;

  // Bridge pushes round-trip through Jira under the shared API token, so the
  // Jira changelog cannot tell which Bridge user actually made the edit. When
  // this version is the echo of our own push, attribute it to the signed-in
  // user we captured at push time instead of the changelog author.
  const versionAuthor = isOwnPushEcho && pushAuthor ? pushAuthor : changeAuthor;

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
  const existingComments = new Map(
    (await db
      .select({ jiraCommentId: jiraComment.jiraCommentId, content: jiraComment.content })
      .from(jiraComment)
      .where(eq(jiraComment.ticketKey, issue.key))
      .all()
    ).map((c) => [c.jiraCommentId, c.content]),
  );

  // Pre-read Jira-sourced link signatures so the terminal event can tell
  // whether the delete-and-reinsert below actually changed anything.
  const previousJiraLinks = await db
    .select({ jiraLinkId: ticketLink.jiraLinkId, linkedKey: ticketLink.linkedKey, relation: ticketLink.relation, status: ticketLink.status, title: ticketLink.title })
    .from(ticketLink)
    .where(and(eq(ticketLink.ticketKey, issue.key), isNotNull(ticketLink.jiraLinkId)))
    .all();

  const ticketData = {
    jiraKey: issue.key,
    jiraId: issue.id,
    title: fields.summary,
    type: normalizeIssueType(fields.issuetype.name),
    status: normalizeStatus(fields.status.name),
    assignee: assigneeName,
    assigneeAvatar,
    assigneeAccountId,
    assigneeEmail,
    epic: epicValue,
    epicKey: epicKeyValue,
    flagged: (() => {
      const raw = (fields as unknown as Record<string, unknown>)[FLAGGED_FIELD];
      return Array.isArray(raw) ? raw.length > 0 : Boolean(raw);
    })(),
    reporter: reporterName,
    reporterAccountId,
    reporterAvatar,
    reporterEmail,
    description: descriptionMarkdown || null,
    acceptanceCriteria: ac,
    storyPoints,
    sprintName,
    sprintIds: sprintIdsJson,
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

  // Accumulate what changed so a single typed event fans out to open views
  // after the transaction. Only updates count: a first sync of a new ticket
  // has no open view to notify.
  const changedKinds = new Set<TicketChangeKind>();
  if (existing) {
    if (statusChanged) changedKinds.add("status");
    if (existing.assignee !== ticketData.assignee) changedKinds.add("assignee");
    if (pointsChanged) changedKinds.add("points");
    if (existing.sprintName !== ticketData.sprintName || existing.sprintIds !== ticketData.sprintIds) changedKinds.add("sprint");
    if (existing.labels !== ticketData.labels || existing.flagged !== ticketData.flagged) changedKinds.add("labels");
    if (needsNewVersion && !isOwnPushEcho) changedKinds.add("content");

    for (const comment of inlineComments) {
      const contentMarkdown = typeof comment.body === "string" ? comment.body : adfToMarkdown(comment.body);
      const prev = existingComments.get(comment.id);
      if (prev === undefined || prev !== contentMarkdown) {
        changedKinds.add("comment");
        break;
      }
    }

    const linkSignature = (l: { linkedKey: string; relation: string | null; status: string | null; title: string | null }) =>
      `${l.linkedKey}|${l.relation ?? ""}|${l.status ?? ""}|${l.title ?? ""}`;
    const prevLinkSigs = previousJiraLinks.map(linkSignature).sort();
    const nextLinkSigs = issuelinks
      .map((link) => {
        const linked = link.inwardIssue ?? link.outwardIssue;
        if (!linked) return null;
        return linkSignature({
          linkedKey: linked.key,
          relation: link.inwardIssue ? link.type.inward : link.type.outward,
          status: normalizeStatus(linked.fields.status.name),
          title: linked.fields.summary,
        });
      })
      .filter((s): s is string => s !== null)
      .sort();
    if (prevLinkSigs.join("\n") !== nextLinkSigs.join("\n")) changedKinds.add("links");
  }

  // All DB writes in a single transaction for SQLite performance
  db.transaction((tx) => {
    // Ticket upsert
    if (existing) {
      tx.update(ticket).set(ticketData).where(eq(ticket.jiraKey, issue.key)).run();
    } else {
      tx.insert(ticket).values(ticketData).run();
    }

    // Keep the indexed sprint-membership bridge in lockstep with sprint_ids.
    // sprintIdList is the source of truth here (sprintName is the fallback for
    // the empty-list case, matching sprintIdsJson going null above).
    syncTicketSprints(tx, issue.key, sprintIdList, sprintName);

    // Keep ticketSubtask rows in sync when this issue IS a subtask.
    // Incremental sync picks up the subtask itself but its parent may not
    // be re-fetched, leaving the parent's ticketSubtask row stale.
    const existingSubtaskRow = tx.select({ id: ticketSubtask.id })
      .from(ticketSubtask)
      .where(eq(ticketSubtask.subtaskKey, issue.key))
      .get();

    if (existingSubtaskRow) {
      tx.update(ticketSubtask)
        .set({
          title: fields.summary,
          status: normalizeStatus(fields.status.name),
          assignee: assigneeName,
          assigneeAvatar,
        })
        .where(eq(ticketSubtask.subtaskKey, issue.key))
        .run();
    } else if (fields.parent?.key) {
      // Subtask synced before its parent: create the relationship row.
      // The parent field on non-epic children points to the story/task parent.
      const parentType = (fields.parent.fields?.issuetype?.name ?? "").toLowerCase();
      if (!parentType.includes("epic")) {
        // Ensure parent ticket row exists (minimal if not yet synced)
        const parentExists = tx.select({ jiraKey: ticket.jiraKey })
          .from(ticket)
          .where(eq(ticket.jiraKey, fields.parent.key))
          .get();
        if (!parentExists) {
          tx.insert(ticket).values({
            jiraKey: fields.parent.key,
            title: fields.parent.fields.summary,
            type: normalizeIssueType(fields.parent.fields.issuetype?.name ?? "task"),
            status: "TO DO",
            sprintName,
            lastSyncedAt: now,
          }).run();
          tx.insert(ticketMetadata).values({ jiraKey: fields.parent.key }).run();
        }
        tx.insert(ticketSubtask).values({
          id: `sub-${fields.parent.key}-${issue.key}`,
          ticketKey: fields.parent.key,
          subtaskKey: issue.key,
          title: fields.summary,
          type: normalizeIssueType(fields.issuetype.name),
          status: normalizeStatus(fields.status.name),
          assignee: assigneeName,
          assigneeAvatar,
        }).run();
      }
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
        updatedBy: versionAuthor?.name ?? null,
        updatedByAvatar: versionAuthor?.avatar ?? null,
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

    // Subtasks: replace all in ticketSubtask + upsert minimal ticket records.
    // Jira's subtasks summary field omits assignee, so preserve existing
    // assignee data from the ticket row or previous ticketSubtask row.
    const existingSubRows = tx.select().from(ticketSubtask).where(eq(ticketSubtask.ticketKey, issue.key)).all();
    const existingSubMap = new Map(existingSubRows.map((r) => [r.subtaskKey, r]));
    tx.delete(ticketSubtask).where(eq(ticketSubtask.ticketKey, issue.key)).run();
    const subtasks = fields.subtasks ?? [];

    if (existing) {
      const prevSubSigs = existingSubRows
        .map((r) => `${r.subtaskKey}|${r.title}|${r.status}`)
        .sort();
      const nextSubSigs = subtasks
        .map((sub) => `${sub.key}|${sub.fields.summary}|${normalizeStatus(sub.fields.status.name)}`)
        .sort();
      if (prevSubSigs.join("\n") !== nextSubSigs.join("\n")) changedKinds.add("subtasks");
    }
    for (const sub of subtasks) {
      const jiraAssignee = sub.fields.assignee?.displayName ?? null;
      const jiraAvatar = sub.fields.assignee?.avatarUrls?.["48x48"] ?? null;

      // Fall back to the subtask's own ticket row for assignee data
      const subTicketRow = !jiraAssignee
        ? tx.select({ assignee: ticket.assignee, assigneeAvatar: ticket.assigneeAvatar }).from(ticket).where(eq(ticket.jiraKey, sub.key)).get()
        : null;
      const prevSubRow = existingSubMap.get(sub.key);

      const resolvedAssignee = jiraAssignee ?? subTicketRow?.assignee ?? prevSubRow?.assignee ?? null;
      const resolvedAvatar = jiraAvatar ?? subTicketRow?.assigneeAvatar ?? prevSubRow?.assigneeAvatar ?? null;

      tx.insert(ticketSubtask).values({
        id: `sub-${issue.key}-${sub.key}`,
        ticketKey: issue.key,
        subtaskKey: sub.key,
        title: sub.fields.summary,
        type: normalizeIssueType(sub.fields.issuetype.name),
        status: normalizeStatus(sub.fields.status.name),
        assignee: resolvedAssignee,
        assigneeAvatar: resolvedAvatar,
      }).run();

      // Also ensure the subtask exists as a ticket row so /tickets/[key] works
      const subExists = tx.select({ jiraKey: ticket.jiraKey }).from(ticket).where(eq(ticket.jiraKey, sub.key)).get();
      const subData = {
        title: sub.fields.summary,
        type: normalizeIssueType(sub.fields.issuetype.name),
        status: normalizeStatus(sub.fields.status.name),
        assignee: jiraAssignee,
        assigneeAvatar: jiraAvatar,
        sprintName,
        lastSyncedAt: now,
      };
      if (subExists) {
        // Preserve assignee on the ticket row too when Jira doesn't provide it
        if (!jiraAssignee && subExists) {
          delete (subData as Record<string, unknown>).assignee;
          delete (subData as Record<string, unknown>).assigneeAvatar;
        }
        tx.update(ticket).set(subData).where(eq(ticket.jiraKey, sub.key)).run();
      } else {
        tx.insert(ticket).values({ jiraKey: sub.key, ...subData }).run();
        tx.insert(ticketMetadata).values({ jiraKey: sub.key }).run();
      }
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

      if (existingComments.has(comment.id)) {
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

  // A new version whose content matches the local mirror is the echo of
  // Bridge's own push; rebase any active Story Writer session so its draft
  // stays "current" instead of flagging it outdated.
  if (needsNewVersion && isOwnPushEcho) {
    db.update(storyWriterSession)
      .set({ baseVersionHash: hash, updatedAt: now })
      .where(and(eq(storyWriterSession.ticketKey, issue.key), eq(storyWriterSession.status, "active")))
      .run();
  }

  // One coalesced event per upsert: every open view subscribed to this ticket
  // (detail page, Story Writer, board/refinement streams) learns what moved.
  // Syncs have no originating tab, so origin stays null and all tabs highlight.
  if (changedKinds.size > 0) {
    emitTicketEvent({ type: "ticket:changed", ticketKey: issue.key, kinds: Array.from(changedKinds), origin: null });
  }

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
