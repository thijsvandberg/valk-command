import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { message, conversation } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentFetch } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { captureTaskStream } from "@/lib/task-stream-handler";
import { nextSequence } from "@/db/next-sequence";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { id: conversationId } = await params;
  const invalid = validatePathParam(conversationId);
  if (invalid) return invalid;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, conversationId),
  });
  if (!conv) {
    return errorResponse("Conversation not found", 404);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return errorResponse("content is required", 400);
  }

  const model = typeof body.model === "string" ? body.model : undefined;
  const codebaseResearch = body.codebaseResearch === true;
  // The codebase-research hint is sent to the agent only; the persisted user
  // message stays clean so the prefix never shows up in the conversation.
  const agentContent = codebaseResearch
    ? `[codebase-research: on]\n\n${content}`
    : content;

  // Save user message to Bridge DB
  const messageId = randomUUID();
  await db.insert(message).values({
    id: messageId,
    conversationId,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    sequence: nextSequence(conversationId),
  });

  // Try to resume the existing workspace session
  const result = await agentFetch<TaskResponse>(
    `/api/conversations/${conversationId}/messages`,
    { method: "POST", body: { content: agentContent, ...(model ? { model } : {}) }, retries: 2 },
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
      body: { skill: "chat", args: { args: agentContent }, conversationId, ...(model ? { model } : {}) },
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
