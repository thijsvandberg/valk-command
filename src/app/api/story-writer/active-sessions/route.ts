import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, ticket, message } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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
  const sessions = await db
    .select({
      sessionId: storyWriterSession.id,
      ticketKey: storyWriterSession.ticketKey,
      updatedAt: storyWriterSession.updatedAt,
    })
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.status, "active"),
        // Only sessions where the user has actually sent at least one message
        sql`EXISTS (SELECT 1 FROM ${message} WHERE ${message.conversationId} = ${storyWriterSession.conversationId})`,
      ),
    )
    .all();

  if (sessions.length === 0) {
    return NextResponse.json([]);
  }

  // Enrich with ticket title + sprint name from local DB
  const tickets = await db.select().from(ticket).all();
  const ticketMap = new Map(tickets.map((t) => [t.jiraKey, t]));

  const result: ActiveSession[] = sessions.map((s) => {
    const t = ticketMap.get(s.ticketKey);
    return {
      sessionId: s.sessionId,
      ticketKey: s.ticketKey,
      title: t?.title ?? s.ticketKey,
      sprintName: t?.sprintName ?? null,
      epic: t?.epic ?? null,
      epicKey: t?.epicKey ?? null,
      issueType: t?.type ?? null,
      status: t?.status ?? "unknown",
      updatedAt: s.updatedAt,
    };
  });

  // Most recently updated first
  result.sort((a, b) => {
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

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
