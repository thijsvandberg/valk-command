import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, ticket, message } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface ActiveSession {
  sessionId: string;
  ticketKey: string;
  title: string;
  sprintName: string | null;
  epic: string | null;
  epicKey: string | null;
  issueType: string | null;
  status: string;
  updatedAt: string | null;
}

export async function GET() {
  // JOIN with ticket table directly instead of loading all tickets into memory
  const rows = await db
    .select({
      sessionId: storyWriterSession.id,
      ticketKey: storyWriterSession.ticketKey,
      updatedAt: storyWriterSession.updatedAt,
      title: ticket.title,
      sprintName: ticket.sprintName,
      epic: ticket.epic,
      epicKey: ticket.epicKey,
      issueType: ticket.type,
      ticketStatus: ticket.status,
    })
    .from(storyWriterSession)
    .leftJoin(ticket, eq(storyWriterSession.ticketKey, ticket.jiraKey))
    .where(
      and(
        eq(storyWriterSession.status, "active"),
        sql`EXISTS (SELECT 1 FROM ${message} WHERE ${message.conversationId} = ${storyWriterSession.conversationId})`,
      ),
    )
    .orderBy(desc(storyWriterSession.updatedAt))
    .all();

  const result: ActiveSession[] = rows.map((r) => ({
    sessionId: r.sessionId,
    ticketKey: r.ticketKey,
    title: r.title ?? r.ticketKey,
    sprintName: r.sprintName ?? null,
    epic: r.epic ?? null,
    epicKey: r.epicKey ?? null,
    issueType: r.issueType ?? null,
    status: r.ticketStatus ?? "unknown",
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  await db
    .update(storyWriterSession)
    .set({ status: "discarded" })
    .where(eq(storyWriterSession.id, sessionId));

  return NextResponse.json({ ok: true });
}
