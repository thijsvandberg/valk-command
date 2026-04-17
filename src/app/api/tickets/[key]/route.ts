import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLocalEdit } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Ticket, TicketDetail, IssueType, JiraStatus, POStatus, TicketReadiness, Assignee, Attachment, JiraComment, Subtask, LinkedIssue } from "@/types/ticket";
import { computeTicketEditState } from "@/lib/ticket-state";
import { timedQuery } from "@/lib/query-timer";
import { cache } from "@/lib/cache";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

function userInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

function buildAssignee(name: string | null): Assignee | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name) };
}

function attachmentColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "#4a90d9";
  if (mimeType === "application/pdf") return "#e5534b";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "#4aaa60";
  return "#94a3b8";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const cacheKey = `/api/tickets/${key}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
      },
    });
  }

  const { result: queryData, durationMs } = await timedQuery(`GET /api/tickets/${key}`, async () => {
    const t = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    });

    if (!t) return null;

    const [meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion] = await Promise.all([
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
      }),
      db.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, key)),
      db.query.storyVersion.findFirst({
        where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
        orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
      }),
    ]);

    return { t, meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion };
  });

  if (!queryData) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { t, meta, attachmentRows, jiraCommentRows, subtaskRows, linkRows, epicChildRows, localEdits, latestVersion } = queryData;

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

  const jiraComments: JiraComment[] = jiraCommentRows.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    authorAvatar: c.authorAvatar ?? null,
    authorInitials: userInitials(c.authorName),
    authorColor: userColor(c.authorName),
    content: c.content,
    createdAt: c.createdAt,
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
    editState,
    notes: meta?.poNotes ?? "",
    sprintId: t.sprintName ?? undefined,
  };

  const subtasks: Subtask[] = subtaskRows.map((s) => ({
    key: s.subtaskKey,
    title: s.title,
    type: (s.type ?? "subtask") as IssueType,
    jiraStatus: (s.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(s.assignee),
  }));

  const linkedIssues: LinkedIssue[] = linkRows.map((l) => ({
    relation: l.relation,
    key: l.linkedKey,
    title: l.title,
    type: (l.type ?? "task") as IssueType,
    jiraStatus: (l.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(l.assignee),
  }));

  const epicChildren: Subtask[] = epicChildRows.map((c) => ({
    key: c.jiraKey,
    title: c.title,
    type: (c.type ?? "task") as IssueType,
    jiraStatus: (c.status ?? "TO DO") as JiraStatus,
    assignee: buildAssignee(c.assignee),
  }));

  // Resolve inline attachment references: ![filename](attachment) → ![filename](/api/attachments/ID)
  const filenameToId = new Map(attachmentRows.map((a) => [a.filename, a.id]));
  const rawDescription = t.description ?? "";
  const description = rawDescription.replace(
    /!\[([^\]]*)\]\(attachment[^)]*\)/g,
    (_match, alt: string) => {
      const id = filenameToId.get(alt);
      return id ? `![${alt}](/api/attachments/${id})` : `![${alt}](attachment)`;
    },
  );

  const detail: TicketDetail = {
    description,
    reporter: buildAssignee(t.reporter),
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
  };

  // Include local edits so the client can render the correct version immediately
  const localEditMap: Record<string, { value: string; isDraft: boolean }> = {};
  for (const edit of localEdits) {
    localEditMap[edit.field] = { value: edit.localValue, isDraft: edit.isDraft };
  }

  const responseBody = {
    ...ticketBase,
    ...detail,
    metadata: meta ?? null,
    localEdits: localEditMap,
  };

  cache.set(cacheKey, responseBody, 60_000);

  return NextResponse.json(responseBody, {
    headers: {
      "X-Query-Time-Ms": String(durationMs),
      "X-Cache": "MISS",
      "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
    },
  });
}

const VALID_ISSUE_TYPES: IssueType[] = ["story", "bug", "task", "spike"];

// Jira uses title-case names for issue types
const JIRA_TYPE_NAMES: Partial<Record<IssueType, string>> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.type || !VALID_ISSUE_TYPES.includes(body.type as IssueType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_ISSUE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const newType = body.type as IssueType;

  await db.update(ticket).set({ type: newType }).where(eq(ticket.jiraKey, key));

  // Sync to Jira in the background; failure does not block the response
  const jiraName = JIRA_TYPE_NAMES[newType];
  if (jiraName) {
    jiraClient.updateIssue(key, { issuetype: { name: jiraName } }).catch((err: unknown) => {
      logger.error("ticket-detail", `PATCH Jira type sync failed for ${key}:`, err);
    });
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Changed issue type to ${newType}`,
  });

  return NextResponse.json({ type: newType });
}
