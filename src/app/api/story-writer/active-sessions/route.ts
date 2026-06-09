import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, ticket, ticketMetadata, ticketSubtask, message } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { buildAssignee } from "@/lib/user-utils";
import type { ActiveSession } from "@/types/story-writer";

export async function GET() {
  // JOIN with ticket table directly instead of loading all tickets into memory
  const rows = await db
    .select({
      sessionId: storyWriterSession.id,
      ticketKey: storyWriterSession.ticketKey,
      updatedAt: storyWriterSession.updatedAt,
      targetTicketKey: storyWriterSession.targetTicketKey,
      title: ticket.title,
      sprintName: ticket.sprintName,
      epic: ticket.epic,
      epicKey: ticket.epicKey,
      issueType: ticket.type,
      ticketStatus: ticket.status,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
      removedFromJiraAt: ticket.removedFromJiraAt,
      storyPoints: ticket.storyPoints,
      assignee: ticket.assignee,
      flagged: ticket.flagged,
      readiness: ticketMetadata.readiness,
      businessValue: ticketMetadata.businessValue,
      qualityScore: ticketMetadata.qualityScore,
      guestimation: ticketMetadata.guestimation,
      poNotes: ticketMetadata.poNotes,
      // Correlated subquery to get the target ticket title without a second join
      targetTitle: sql<string | null>`(SELECT title FROM ticket WHERE jira_key = ${storyWriterSession.targetTicketKey})`,
    })
    .from(storyWriterSession)
    .leftJoin(ticket, eq(storyWriterSession.ticketKey, ticket.jiraKey))
    .leftJoin(ticketMetadata, eq(storyWriterSession.ticketKey, ticketMetadata.jiraKey))
    .where(
      and(
        eq(storyWriterSession.status, "active"),
        sql`EXISTS (SELECT 1 FROM ${message} WHERE ${message.conversationId} = ${storyWriterSession.conversationId})`,
      ),
    )
    .orderBy(desc(storyWriterSession.updatedAt))
    .all();

  // Open/total subtask counts for the inline "open/total" badge, mirroring /api/tickets.
  const ticketKeys = rows.map((r) => r.ticketKey);
  const subtaskCounts = ticketKeys.length
    ? await db
        .select({
          ticketKey: ticketSubtask.ticketKey,
          total: sql<number>`COUNT(*)`.as("total"),
          open: sql<number>`SUM(CASE WHEN ${ticketSubtask.status} NOT IN ('DONE', 'DEPRECATED') THEN 1 ELSE 0 END)`.as("open"),
        })
        .from(ticketSubtask)
        .where(inArray(ticketSubtask.ticketKey, ticketKeys))
        .groupBy(ticketSubtask.ticketKey)
        .all()
    : [];
  const subtaskCountByKey = new Map<string, { total: number; open: number }>();
  for (const row of subtaskCounts) {
    subtaskCountByKey.set(row.ticketKey, { total: row.total, open: row.open ?? 0 });
  }

  const result: ActiveSession[] = rows.map((r) => ({
    sessionId: r.sessionId,
    ticketKey: r.ticketKey,
    title: r.title ?? r.ticketKey,
    sprintName: r.sprintName || null,
    epic: r.epic ?? null,
    epicKey: r.epicKey ?? null,
    issueType: r.issueType ?? null,
    status: r.ticketStatus ?? "unknown",
    readiness: r.readiness ?? null,
    storyPoints: r.storyPoints ?? null,
    guestimation: r.guestimation ?? null,
    businessValue: r.businessValue ?? null,
    qualityScore: r.qualityScore ?? null,
    assignee: buildAssignee(r.assignee ?? null),
    flagged: r.flagged ?? false,
    notes: r.poNotes ?? "",
    openSubtaskCount: subtaskCountByKey.get(r.ticketKey)?.open ?? 0,
    totalSubtaskCount: subtaskCountByKey.get(r.ticketKey)?.total ?? 0,
    updatedAt: r.updatedAt,
    jiraUpdatedAt: r.jiraUpdatedAt ?? null,
    targetTicketKey: r.targetTicketKey ?? null,
    targetTitle: r.targetTitle ?? null,
    removedFromJira: !!r.removedFromJiraAt,
  }));

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  await db
    .update(storyWriterSession)
    .set({ status: "discarded" })
    .where(eq(storyWriterSession.id, sessionId));

  return NextResponse.json({ ok: true });
}
