import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { storyWriterSession, message, ticket, jiraComment } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { agentFetch, type AgentError } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logActivity } from "@/lib/activity-logger";

type RouteContext = { params: Promise<{ key: string }> };

function agentErrorResponse(error: AgentError, status: number) {
  return NextResponse.json(
    { error: error.error, code: error.code },
    { status: status || 502 },
  );
}

function computeContentHash(conversationId: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(conversationId + normalized).digest("hex");
}

async function markMessageFailed(messageId: string) {
  await db.update(message).set({ status: "failed" }).where(eq(message.id, messageId));
}

/**
 * Sends a message in the story writer conversation.
 * First message: creates a workspace task with the write-story-draft skill.
 * Follow-up: sends to the workspace conversation endpoint (resumes CLI session).
 * On 410 (session lost): recovers by re-sending with current context as a new first message.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

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

  const codebaseResearch = body.codebaseResearch === true;
  const model = typeof body.model === "string" ? body.model : undefined;
  const skill = typeof body.skill === "string" ? body.skill : null;
  const retryMessageId = typeof body.retryMessageId === "string" ? body.retryMessageId : null;

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

  const contentHash = computeContentHash(session.conversationId, content);

  // Server-side dedup: reject identical message within 30s window
  if (!retryMessageId) {
    const recent = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(
          eq(message.conversationId, session.conversationId),
          eq(message.contentHash, contentHash),
          sql`${message.timestamp} > datetime('now', '-30 seconds')`,
        ),
      )
      .get();

    if (recent) {
      return NextResponse.json(
        { error: "Duplicate message", code: "DUPLICATE" },
        { status: 409 },
      );
    }
  }

  let messageId: string;

  if (retryMessageId) {
    // Retry: reuse the existing failed message row
    await db
      .update(message)
      .set({ status: "pending", contentHash })
      .where(eq(message.id, retryMessageId));
    messageId = retryMessageId;
  } else {
    // New message: insert as pending
    messageId = randomUUID();
    await db.insert(message).values({
      id: messageId,
      conversationId: session.conversationId,
      role: "user",
      content,
      status: "pending",
      contentHash,
    });
  }

  await db
    .update(storyWriterSession)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(storyWriterSession.id, session.id));

  // Check if this is the first message (no assistant messages yet)
  const assistantMessages = await db
    .select()
    .from(message)
    .where(
      and(
        eq(message.conversationId, session.conversationId),
        eq(message.role, "assistant"),
      ),
    )
    .all();

  const isFirstMessage = assistantMessages.length === 0;

  interface TaskResponse { id?: string; error?: string }

  const messageStart = Date.now();
  const messageStartedAt = new Date().toISOString();

  if (skill === "find-related") {
    const result = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: {
        skill: "find-related",
        args: { args: key },
        conversationId: session.conversationId,
        model,
      },
      retries: 2,
    });

    if (!result.ok) {
      await markMessageFailed(messageId);
      await logActivity({
        type: "story-writer",
        scope: key,
        status: "failed",
        summary: `Story writer message failed for ${key}: ${result.error.code}`,
        errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: result.status, retryCount: result.retryCount }),
        durationMs: Date.now() - messageStart,
        startedAt: messageStartedAt,
      });
      return agentErrorResponse(result.error, result.status);
    }
    await logActivity({
      type: "story-writer",
      scope: key,
      status: "success",
      summary: `Story writer message sent for ${key}`,
      durationMs: Date.now() - messageStart,
      startedAt: messageStartedAt,
    });
    return taskCreatedResponse(messageId, result.data, isFirstMessage);
  }

  if (isFirstMessage) {
    const taskBody = await buildFirstMessageBody(session, key, content, codebaseResearch, model);

    const result = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: taskBody,
      retries: 2,
    });

    if (!result.ok) {
      await markMessageFailed(messageId);
      await logActivity({
        type: "story-writer",
        scope: key,
        status: "failed",
        summary: `Story writer message failed for ${key}: ${result.error.code}`,
        errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: result.status, retryCount: result.retryCount }),
        durationMs: Date.now() - messageStart,
        startedAt: messageStartedAt,
      });
      return agentErrorResponse(result.error, result.status);
    }
    await logActivity({
      type: "story-writer",
      scope: key,
      status: "success",
      summary: `Story writer message sent for ${key}`,
      durationMs: Date.now() - messageStart,
      startedAt: messageStartedAt,
    });
    return taskCreatedResponse(messageId, result.data, isFirstMessage);
  }

  // Follow-up message: resume the existing workspace conversation
  const followUpContent = buildFollowUpContent(session, key, content, codebaseResearch);

  const result = await agentFetch<TaskResponse>(
    `/api/conversations/${session.conversationId}/messages`,
    {
      method: "POST",
      body: { content: followUpContent, model },
      retries: 2,
    },
  );

  // Session lost on workspace side: log the 410, then attempt recovery as a sibling entry
  if (!result.ok && result.status === 410) {
    await logActivity({
      type: "story-writer",
      scope: key,
      status: "failed",
      summary: `Story writer message failed for ${key}: session lost (410)`,
      errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: 410, retryCount: result.retryCount }),
      durationMs: Date.now() - messageStart,
      startedAt: messageStartedAt,
    });

    const recoveryStart = Date.now();
    const recoveryStartedAt = new Date().toISOString();
    const recovered = await recoverSession(session, key, content);

    await logActivity({
      type: "story-writer",
      scope: key,
      status: recovered.status === 201 ? "success" : "failed",
      summary: recovered.status === 201
        ? `Story writer session recovered for ${key}`
        : `Story writer session recovery failed for ${key}`,
      durationMs: Date.now() - recoveryStart,
      startedAt: recoveryStartedAt,
    });

    if (recovered.status !== 201) {
      await markMessageFailed(messageId);
    }
    return NextResponse.json(recovered.body, { status: recovered.status });
  }

  if (!result.ok) {
    await markMessageFailed(messageId);
    await logActivity({
      type: "story-writer",
      scope: key,
      status: "failed",
      summary: `Story writer message failed for ${key}: ${result.error.code}`,
      errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: result.status, retryCount: result.retryCount }),
      durationMs: Date.now() - messageStart,
      startedAt: messageStartedAt,
    });
    return agentErrorResponse(result.error, result.status);
  }
  await logActivity({
    type: "story-writer",
    scope: key,
    status: "success",
    summary: `Story writer message sent for ${key}`,
    durationMs: Date.now() - messageStart,
    startedAt: messageStartedAt,
  });
  return taskCreatedResponse(messageId, result.data, isFirstMessage);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;
  const url = new URL(request.url);
  const failedOnly = url.searchParams.get("failed") === "true";

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

  if (failedOnly) {
    const deleted = await db
      .delete(message)
      .where(
        and(
          eq(message.conversationId, session.conversationId),
          sql`${message.status} IN ('pending', 'failed')`,
        ),
      );
    return NextResponse.json({ success: true, deleted: deleted.changes });
  }

  return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
}

async function taskCreatedResponse(
  messageId: string,
  taskData: { id?: string; error?: string },
  isFirstMessage: boolean,
) {
  const taskId = taskData.id ?? "";

  await db
    .update(message)
    .set({ workspaceTaskId: taskId || null, status: "sent" })
    .where(eq(message.id, messageId));

  return NextResponse.json({
    messageId,
    taskId,
    streamUrl: `/api/workspace-tasks/${taskId}/stream`,
    isFirstMessage,
  }, { status: 201 });
}

async function buildFirstMessageBody(
  session: { conversationId: string; localDraft: string | null; targetTicketKey: string | null; targetLocalDraft: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
  model: string | undefined,
) {
  const ticketRow = await db
    .select()
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  const comments = await db
    .select()
    .from(jiraComment)
    .where(eq(jiraComment.ticketKey, key))
    .all();

  const contextParts = [];
  if (ticketRow) {
    contextParts.push(`Ticket: ${key} - ${ticketRow.title}`);
    contextParts.push(`Issue type: ${ticketRow.type ?? "story"}`);
    contextParts.push(`Current description:\n${ticketRow.description ?? "(empty)"}`);
  }
  if (comments.length > 0) {
    const formatted = comments
      .map((c) => `[${c.authorName}] ${c.content}`)
      .join("\n---\n");
    contextParts.push(`Jira comments (${comments.length}):\n${formatted}`);
  }

  if (session.targetTicketKey) {
    const targetTicketRow = await db
      .select()
      .from(ticket)
      .where(eq(ticket.jiraKey, session.targetTicketKey))
      .get();
    contextParts.push(
      `[Split mode] You are helping redistribute content between two stories.\n` +
      `Original story: ${key}${ticketRow ? ` - ${ticketRow.title}` : ""}\n` +
      `Target story: ${session.targetTicketKey}${targetTicketRow ? ` - ${targetTicketRow.title}` : ""}\n` +
      `Target story current content:\n${session.targetLocalDraft || "(empty)"}\n\n` +
      `Output a revised version of the original story using <story-draft> and a revised version of the target story using <story-draft slot="target">.`,
    );
  }

  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;
  contextParts.push(
    `${researchFlag}\n\nUser request: ${content}\n\n` +
    `Important: Besides the <story-draft> block, always include a brief commentary outside the tags explaining what you changed and why. When relevant, end with a follow-up question to guide the next iteration.\n` +
    `If the content clearly fits a different issue type (story, bug, task, spike), include a <type-suggestion>type</type-suggestion> tag to suggest changing it. Only suggest when it is clearly warranted.`
  );

  return {
    skill: "write-story-draft",
    args: { args: contextParts.join("\n\n") },
    conversationId: session.conversationId,
    model,
  };
}

function buildFollowUpContent(
  session: { localDraft: string | null; targetTicketKey: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
): string {
  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;

  const draftContext = session.localDraft
    ? `\n\n[Current story draft]\n${session.localDraft}\n[End of draft]`
    : "";

  let splitReminder = "";
  if (session.targetTicketKey) {
    splitReminder =
      `\n\n[Split mode: original=${key}, target=${session.targetTicketKey}. ` +
      `Output <story-draft> for original and <story-draft slot="target"> for target story.]`;
  }

  return `${researchFlag}${draftContext}\n\n${content}${splitReminder}\n\n[Remember: besides the <story-draft> block, include a brief commentary explaining what you changed. When relevant, end with a follow-up question. If the content clearly fits a different issue type (story, bug, task, spike), include a <type-suggestion>type</type-suggestion> tag.]`;
}

/**
 * Recovers a lost workspace session by re-sending context + user message
 * as a new first message with the write-story-draft skill.
 */
async function recoverSession(
  session: { conversationId: string; localDraft: string | null; ticketKey: string },
  key: string,
  userMessage: string,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const ticketRow = await db
    .select()
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  const recoveryPrompt = [
    `[Session recovery] The previous conversation context was lost. Here is the current state:`,
    `Ticket: ${key}${ticketRow ? ` - ${ticketRow.title}` : ""}`,
    ticketRow?.description ? `Current Jira description:\n${ticketRow.description}` : "",
    session.localDraft ? `Current working draft:\n${session.localDraft}` : "",
    `\nUser message: ${userMessage}`,
  ].filter(Boolean).join("\n\n");

  const result = await agentFetch<{ id?: string; error?: string }>("/api/tasks", {
    method: "POST",
    body: {
      skill: "write-story-draft",
      args: { args: recoveryPrompt },
      conversationId: session.conversationId,
    },
    retries: 2,
  });

  if (!result.ok) {
    return {
      body: { error: result.error.error, code: result.error.code },
      status: result.status || 502,
    };
  }

  const taskId = result.data.id ?? "";
  return {
    body: {
      messageId: `recovered-${Date.now()}`,
      taskId,
      streamUrl: `/api/workspace-tasks/${taskId}/stream`,
      isFirstMessage: true,
      recovered: true,
    },
    status: 201,
  };
}
