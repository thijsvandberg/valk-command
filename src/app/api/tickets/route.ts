import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Ticket, IssueType, JiraStatus, POStatus, Assignee } from "@/types/ticket";

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

function computeFreshness(lastSyncedAt: string | null): "fresh" | "stale" {
  if (!lastSyncedAt) return "stale";
  const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
  return diffMs < 5 * 60 * 1000 ? "fresh" : "stale";
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

  const result: Ticket[] = rows.map(({ t, meta }) => ({
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
    qualityStale: meta?.qualityStale ?? false,
    notes: meta?.poNotes ?? "",
    sprintId: t.sprintName ?? undefined,
    freshness: computeFreshness(t.lastSyncedAt),
  }));

  return NextResponse.json(result);
}
