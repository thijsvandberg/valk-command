import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, storyWriterDraft, message } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { extractStoryDraft } from "@/lib/story-draft-parser";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Extracts a story draft from workspace output and saves it as an AI draft entry.
 * Never auto-applies to localDraft; the user explicitly accepts/merges.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const output = typeof body.output === "string" ? body.output : "";
  const taskId = typeof body.taskId === "string" ? body.taskId : null;
  const assistantContent = typeof body.assistantContent === "string" ? body.assistantContent : null;

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
    return NextResponse.json({ error: "No active story writer session" }, { status: 404 });
  }

  // Save assistant message if provided
  let savedMessageId: string | null = null;
  if (assistantContent) {
    savedMessageId = randomUUID();
    await db.insert(message).values({
      id: savedMessageId,
      conversationId: session.conversationId,
      role: "assistant",
      content: assistantContent,
      workspaceTaskId: taskId,
    });
  }

  // Extract draft from output
  const draftContent = extractStoryDraft(output);

  if (!draftContent) {
    return NextResponse.json({
      draftId: null,
      draftIndex: null,
      hasDraft: false,
    });
  }

  // Determine next draft index
  const maxIndex = await db
    .select({ maxIdx: sql<number>`max(${storyWriterDraft.draftIndex})` })
    .from(storyWriterDraft)
    .where(eq(storyWriterDraft.sessionId, session.id))
    .get();

  const nextIndex = (maxIndex?.maxIdx ?? -1) + 1;
  const draftId = randomUUID();

  await db.insert(storyWriterDraft).values({
    id: draftId,
    sessionId: session.id,
    draftIndex: nextIndex,
    content: draftContent,
    messageId: savedMessageId,
  });

  return NextResponse.json({
    draftId,
    draftIndex: nextIndex,
    hasDraft: true,
  });
}

/**
 * DELETE: dismiss a specific AI draft by ID (query param ?draftId=xxx)
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const url = new URL(request.url);
  const draftId = url.searchParams.get("draftId");

  if (!draftId) {
    return NextResponse.json({ error: "draftId query param required" }, { status: 400 });
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

  await db
    .delete(storyWriterDraft)
    .where(
      and(
        eq(storyWriterDraft.id, draftId),
        eq(storyWriterDraft.sessionId, session.id),
      ),
    );

  return NextResponse.json({ success: true });
}
