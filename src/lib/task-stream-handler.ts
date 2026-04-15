import "server-only";
import { db } from "@/db";
import { workspaceTask, message } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

const STREAM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface CaptureParams {
  taskId: string;
  skillName: string;
  conversationId: string;
  relatedTicket: string | null;
}

/**
 * Parses a raw SSE stream body into discrete events.
 * Yields { event, data } objects for each complete SSE message.
 */
async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  try {
    while (true) {
      if (signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          yield { event: currentEvent, data };
          currentEvent = "message";
        } else if (line === "") {
          // Empty line resets the event type
          currentEvent = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Saves a message to the conversation if a message with that workspaceTaskId
 * does not already exist (deduplication guard against concurrent client-side saves).
 */
async function saveAssistantMessage(
  conversationId: string,
  content: string,
  workspaceTaskId: string,
): Promise<void> {
  const existing = await db.query.message.findFirst({
    where: (m, { eq: eq_ }) => eq_(m.workspaceTaskId, workspaceTaskId),
  });
  if (existing) return;

  await db.insert(message).values({
    id: randomUUID(),
    conversationId,
    role: "assistant",
    content,
    workspaceTaskId,
  });
}

/**
 * Background handler that connects to the VRW SSE stream and captures
 * the task result server-side, independently of the browser connection.
 * Called via after() so it runs after the HTTP response is sent.
 */
export async function captureTaskStream(params: CaptureParams): Promise<void> {
  const { taskId, skillName, conversationId, relatedTicket } = params;

  // Record the task in Bridge's local DB
  await db.insert(workspaceTask).values({
    id: taskId,
    skillName,
    status: "running",
    startedAt: new Date().toISOString(),
    conversationId,
    relatedTicket,
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

  let output: string | null = null;
  let errorMessage: string | null = null;

  try {
    const headers = agentHeaders();
    delete headers["Content-Type"];

    const res = await fetch(agentUrl(`/api/tasks/${taskId}/stream`), {
      headers,
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      errorMessage = `Stream failed: HTTP ${res.status}`;
    } else {
      for await (const { event, data } of parseSSE(res.body, abortController.signal)) {
        if (event === "result") {
          try {
            const parsed = JSON.parse(data) as { output?: string };
            output = parsed.output ?? data;
          } catch {
            output = data;
          }
          break;
        } else if (event === "error") {
          try {
            const parsed = JSON.parse(data) as { message?: string };
            errorMessage = parsed.message ?? "Task failed";
          } catch {
            errorMessage = "Task failed";
          }
          break;
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      errorMessage = "Task timed out after 10 minutes";
    } else {
      errorMessage = err instanceof Error ? err.message : "Unknown error";
    }
  } finally {
    clearTimeout(timeout);
  }

  if (output !== null) {
    await db.update(workspaceTask)
      .set({ status: "completed", completedAt: new Date().toISOString(), output })
      .where(eq(workspaceTask.id, taskId));

    await saveAssistantMessage(conversationId, output, taskId);

    createNotification(
      "task-complete",
      `${skillName} task completed`,
      { category: "agent", linkUrl: `/chat/${conversationId}` },
    );

    logger.info("task-stream-handler", "task_completed", {
      event: "task_stream_captured",
      taskId,
      skillName,
      conversationId,
    });
  } else {
    const errText = errorMessage ?? "Task did not return a result";

    await db.update(workspaceTask)
      .set({ status: "failed", completedAt: new Date().toISOString(), error: errText })
      .where(eq(workspaceTask.id, taskId));

    await saveAssistantMessage(
      conversationId,
      `Task failed: ${errText}`,
      taskId,
    );

    logger.warn("task-stream-handler", "task_failed", {
      event: "task_stream_failed",
      taskId,
      skillName,
      conversationId,
      error: errText,
    });
  }
}
