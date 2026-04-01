import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketLocalEdit, storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Ticket, IssueType, JiraStatus, POStatus, Assignee, TicketEditState } from "@/types/ticket";
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  const query = db
    .select({
      t: ticket,
      meta: ticketMetadata,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey));

  const rows = sprintId
    ? await query.where(eq(ticket.sprintName, sprintId))
    : await query;

  // Batch-fetch local edits and latest versions for edit state computation
  const allKeys = rows.map(({ t }) => t.jiraKey);
  const [allLocalEdits, allVersions] = await Promise.all([
    allKeys.length > 0
      ? db.select().from(ticketLocalEdit)
      : Promise.resolve([]),
    allKeys.length > 0
      ? db.select().from(storyVersion)
      : Promise.resolve([]),
  ]);

  const editsByKey = new Map<string, typeof allLocalEdits>();
  for (const edit of allLocalEdits) {
    const existing = editsByKey.get(edit.ticketKey) ?? [];
    existing.push(edit);
    editsByKey.set(edit.ticketKey, existing);
  }

  const latestHashByKey = new Map<string, string>();
  for (const v of allVersions) {
    const existing = latestHashByKey.get(v.jiraKey);
    if (!existing) {
      latestHashByKey.set(v.jiraKey, v.contentHash);
    }
  }

  // Re-compute with proper ordering (latest version = most recent createdAt)
  const versionsByKey = new Map<string, { contentHash: string; createdAt: string }[]>();
  for (const v of allVersions) {
    const existing = versionsByKey.get(v.jiraKey) ?? [];
    existing.push({ contentHash: v.contentHash, createdAt: v.createdAt });
    versionsByKey.set(v.jiraKey, existing);
  }
  for (const [key, versions] of versionsByKey) {
    versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    latestHashByKey.set(key, versions[0].contentHash);
  }

  const result: Ticket[] = rows.map(({ t, meta }) => {
    const edits = editsByKey.get(t.jiraKey) ?? [];
    const latestHash = latestHashByKey.get(t.jiraKey) ?? null;
    const editState: TicketEditState = computeTicketEditState(edits, latestHash);

    return {
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
  });

  return NextResponse.json(result);
}
