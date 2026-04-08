import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, storyWriterDraft, storyWriterExecutionLog, message } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { extractStoryDrafts } from "@/lib/story-draft-parser";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

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

  // Extract original and optional target drafts from output
  const { originalDraft, targetDraft } = extractStoryDrafts(output);

  if (!originalDraft && !targetDraft) {
    return NextResponse.json({
      originalDraftId: null,
      targetDraftId: null,
      hasDraft: false,
    });
  }

  // Determine next draft index across all slots for this session
  const maxIndex = await db
    .select({ maxIdx: sql<number>`max(${storyWriterDraft.draftIndex})` })
    .from(storyWriterDraft)
    .where(eq(storyWriterDraft.sessionId, session.id))
    .get();

  let nextIndex = (maxIndex?.maxIdx ?? -1) + 1;
  let originalDraftId: string | null = null;
  let targetDraftId: string | null = null;

  if (originalDraft) {
    originalDraftId = randomUUID();
    await db.insert(storyWriterDraft).values({
      id: originalDraftId,
      sessionId: session.id,
      draftIndex: nextIndex,
      content: originalDraft,
      storySlot: "original",
      messageId: savedMessageId,
    });
    nextIndex += 1;
  }

  if (targetDraft) {
    targetDraftId = randomUUID();
    await db.insert(storyWriterDraft).values({
      id: targetDraftId,
      sessionId: session.id,
      draftIndex: nextIndex,
      content: targetDraft,
      storySlot: "target",
      messageId: savedMessageId,
    });
  }

  // Fetch and store the raw execution log from the workspace in the background.
  // This is non-critical and can be slow, so we don't block the response on it.
  if (taskId) {
    fetchAndStoreExecutionLog(session.id, taskId, session.conversationId, key).catch(() => {});
  }

  return NextResponse.json({
    originalDraftId,
    targetDraftId,
    hasDraft: true,
  });
}

async function fetchAndStoreExecutionLog(
  sessionId: string,
  taskId: string,
  conversationId: string,
  ticketKey: string,
): Promise<void> {
  const res = await fetch(agentUrl(`/api/tasks/${taskId}/log`), {
    headers: agentHeaders(),
  });
  if (!res.ok) return;

  const log = await res.json();
  if (!Array.isArray(log) || log.length === 0) return;

  // Deduplicate: skip if a log for this taskId already exists
  const existing = await db
    .select({ id: storyWriterExecutionLog.id })
    .from(storyWriterExecutionLog)
    .where(eq(storyWriterExecutionLog.taskId, taskId))
    .get();
  if (existing) return;

  await db.insert(storyWriterExecutionLog).values({
    id: randomUUID(),
    sessionId,
    taskId,
    conversationId,
    ticketKey,
    log: JSON.stringify(log),
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
