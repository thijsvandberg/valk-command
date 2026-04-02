import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, storyWriterDraft, conversation, message, storyVersion, ticket } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;

  try {
    const session = await db
      .select()
      .from(storyWriterSession)
      .where(
        and(
          eq(storyWriterSession.ticketKey, key),
          eq(storyWriterSession.status, "active"),
        ),
      )
      .get();

    if (!session) {
      return NextResponse.json({ session: null, messages: [], aiDrafts: [] });
    }

    const [messages, aiDrafts] = await Promise.all([
      db.select().from(message)
        .where(eq(message.conversationId, session.conversationId))
        .orderBy(message.timestamp)
        .all(),
      db.select().from(storyWriterDraft)
        .where(eq(storyWriterDraft.sessionId, session.id))
        .orderBy(storyWriterDraft.draftIndex)
        .all(),
    ]);

    return NextResponse.json({ session, messages, aiDrafts });
  } catch (err) {
    console.error("[story-writer GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { key } = await params;

  try {
    const existing = await db
      .select()
      .from(storyWriterSession)
      .where(
        and(
          eq(storyWriterSession.ticketKey, key),
          eq(storyWriterSession.status, "active"),
        ),
      )
      .get();

    if (existing) {
      return NextResponse.json(
        { error: "An active story writer session already exists for this ticket" },
        { status: 409 },
      );
    }

    const ticketRow = await db
      .select()
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();

    if (!ticketRow) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const latestVersion = await db.query.storyVersion.findFirst({
      where: eq(storyVersion.jiraKey, key),
      orderBy: [desc(storyVersion.createdAt)],
    });

    const conversationId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(conversation).values({
      id: conversationId,
      title: `Story Writer: ${key}`,
      relatedTicket: key,
    });

    await db.insert(storyWriterSession).values({
      id: sessionId,
      ticketKey: key,
      conversationId,
      status: "active",
      localDraft: ticketRow.description ?? "",
      baseVersionHash: latestVersion?.contentHash ?? null,
    });

    const session = await db
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, sessionId))
      .get();

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: "Started story writer session",
    });

    return NextResponse.json({ session, messages: [], aiDrafts: [] }, { status: 201 });
  } catch (err) {
    console.error("[story-writer POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (typeof body.localDraft === "string") {
    updates.localDraft = body.localDraft;
  }
  if (typeof body.status === "string" && ["active", "completed", "discarded"].includes(body.status as string)) {
    updates.status = body.status;
  }

  // Accept a specific AI draft: copy its content to localDraft
  if (typeof body.acceptDraftId === "string") {
    const draft = await db
      .select()
      .from(storyWriterDraft)
      .where(eq(storyWriterDraft.id, body.acceptDraftId as string))
      .get();
    if (draft) {
      updates.localDraft = draft.content;
    }
  }

  await db
    .update(storyWriterSession)
    .set(updates)
    .where(eq(storyWriterSession.id, session.id));

  const updated = await db
    .select()
    .from(storyWriterSession)
    .where(eq(storyWriterSession.id, session.id))
    .get();

  return NextResponse.json({ session: updated });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const url = new URL(request.url);
  const deleteConversation = url.searchParams.get("deleteConversation") === "true";

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 404 });
  }

  if (deleteConversation) {
    // Drafts cascade-delete from session FK. Delete session, then conversation.
    await db.delete(storyWriterSession).where(eq(storyWriterSession.id, session.id));
    await db.delete(conversation).where(eq(conversation.id, session.conversationId));
  } else {
    // Discard session; drafts cascade-delete, conversation kept
    await db.delete(storyWriterDraft).where(eq(storyWriterDraft.sessionId, session.id));
    await db
      .update(storyWriterSession)
      .set({ status: "discarded", updatedAt: new Date().toISOString() })
      .where(eq(storyWriterSession.id, session.id));
  }

  await logActivity({
    type: "story-writer",
    scope: key,
    summary: "Discarded story writer session",
  });

  return NextResponse.json({ success: true });
}
