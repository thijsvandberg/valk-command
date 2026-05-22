import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { message, conversation } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentFetch } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { captureTaskStream } from "@/lib/task-stream-handler";

type RouteContext = { params: Promise<{ id: string }> };

interface TaskResponse {
  id: string;
  status: string;
  streamUrl?: string;
}

/**
 * Sends a follow-up chat message by resuming the existing workspace session.
 * Falls back to creating a fresh chat task if the session is lost (410).
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  const { id: conversationId } = await params;
  const invalid = validatePathParam(conversationId);
  if (invalid) return invalid;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, conversationId),
  });
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Save user message to Bridge DB
  const messageId = randomUUID();
  await db.insert(message).values({
    id: messageId,
    conversationId,
    role: "user",
    content,
  });

  // Try to resume the existing workspace session
  const result = await agentFetch<TaskResponse>(
    `/api/conversations/${conversationId}/messages`,
    { method: "POST", body: { content }, retries: 2 },
  );

  // Session still active: spawn background capture and return
  if (result.ok) {
    const taskData = result.data;
    const taskId = taskData.id;

    if (taskId) {
      after(async () => {
        await captureTaskStream({
          taskId,
          skillName: "chat",
          conversationId,
          relatedTicket: conv.relatedTicket ?? null,
        });
      });
    }

    return NextResponse.json({ ...taskData, conversationId }, { status: 201 });
  }

  // Session lost (410): fall back to creating a fresh chat task
  if (result.status === 410) {
    const fallbackResult = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: { skill: "chat", args: { args: content }, conversationId },
      retries: 2,
    });

    if (!fallbackResult.ok) {
      await db.update(message).set({ status: "failed" }).where(eq(message.id, messageId));
      return NextResponse.json(
        { error: fallbackResult.error.error, code: fallbackResult.error.code },
        { status: fallbackResult.status || 502 },
      );
    }

    const taskData = fallbackResult.data;
    const taskId = taskData.id;

    if (taskId) {
      after(async () => {
        await captureTaskStream({
          taskId,
          skillName: "chat",
          conversationId,
          relatedTicket: conv.relatedTicket ?? null,
        });
      });
    }

    return NextResponse.json({ ...taskData, conversationId }, { status: 201 });
  }

  // Other error
  await db.update(message).set({ status: "failed" }).where(eq(message.id, messageId));
  return NextResponse.json(
    { error: result.error.error, code: result.error.code },
    { status: result.status || 502 },
  );
}
