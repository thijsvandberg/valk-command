import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLocalEdit, storyVersion } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { Ticket, TicketDetail, IssueType, JiraStatus, POStatus, Assignee, Attachment, JiraComment } from "@/types/ticket";
import { computeTicketEditState } from "@/lib/ticket-state";

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

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
  });

  const attachmentRows = await db.query.ticketAttachment.findMany({
    where: (a, { eq: eqFn }) => eqFn(a.ticketKey, key),
  });

  const jiraCommentRows = await db.query.jiraComment.findMany({
    where: (c, { eq: eqFn }) => eqFn(c.ticketKey, key),
  });

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

  const labels: string[] = t.labels ? JSON.parse(t.labels) : [];
  const components: string[] = t.components ? JSON.parse(t.components) : [];

  // Compute edit state from local edits vs latest Jira mirror
  const [localEdits, latestVersion] = await Promise.all([
    db.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, key)),
    db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
    }),
  ]);

  const editState = computeTicketEditState(localEdits, latestVersion?.contentHash ?? null);

  const ticketBase: Ticket = {
    key: t.jiraKey,
    title: t.title,
    type: (t.type ?? "task") as IssueType,
    epic: t.epic ?? null,
    jiraStatus: (t.status ?? "TO DO") as JiraStatus,
    storyPoints: t.storyPoints ?? null,
    assignee: buildAssignee(t.assignee),
    flagged: t.flagged ?? false,
    poStatus: (meta?.poStatus ?? null) as POStatus,
    qualityScore: meta?.qualityScore ?? null,
    editState,
    notes: meta?.poNotes ?? "",
    sprintId: t.sprintName ?? undefined,
  };

  const detail: TicketDetail = {
    description: t.description ?? "",
    reporter: buildAssignee(t.reporter),
    labels,
    components,
    priority: (t.priority ?? "Medium") as TicketDetail["priority"],
    createdAt: t.jiraCreatedAt ?? t.lastSyncedAt ?? new Date().toISOString(),
    updatedAt: t.jiraUpdatedAt ?? t.lastSyncedAt ?? new Date().toISOString(),
    attachments,
    subtasks: [],
    linkedIssues: [],
    jiraComments,
  };

  return NextResponse.json({
    ...ticketBase,
    ...detail,
    metadata: meta ?? null,
  });
}
