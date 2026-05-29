import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { refinementSession, ticket, ticketSubtask, subtaskSuggestion, conversation, message } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { agentFetch } from "@/lib/agent-fetch";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";
import { parseSubtaskSuggestions } from "@/lib/parse-subtask-suggestions";
import { createNotification } from "@/lib/notifications";
import { nextSequence } from "@/db/next-sequence";
import { logger } from "@/lib/logger";
import { emitRefinementEvent } from "@/lib/refinement-events";

type RouteContext = { params: Promise<{ id: string }> };

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;

function conversationIdForSession(sessionId: string): string {
  return `bulk-suggest-${sessionId}`;
}

function postMessage(convId: string, role: "user" | "assistant", content: string): void {
  db.insert(message).values({
    id: randomUUID(),
    conversationId: convId,
    role,
    content,
    timestamp: new Date().toISOString(),
    sequence: nextSequence(convId),
  }).run();
}

async function captureSubtaskResult(taskId: string): Promise<{ output: string | null; error: string | null }> {
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
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";

      while (true) {
        if (abortController.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (currentEvent === "result") {
              try {
                const parsed = JSON.parse(data) as { output?: string };
                output = parsed.output ?? data;
              } catch {
                output = data;
              }
              reader.releaseLock();
              return { output, error: null };
            } else if (currentEvent === "error") {
              try {
                const parsed = JSON.parse(data) as { message?: string };
                errorMessage = parsed.message ?? "Task failed";
              } catch {
                errorMessage = "Task failed";
              }
              reader.releaseLock();
              return { output: null, error: errorMessage };
            }
            currentEvent = "message";
          } else if (line === "") {
            currentEvent = "message";
          }
        }
      }
      reader.releaseLock();
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

  return { output, error: errorMessage ?? "Task did not return a result" };
}

/**
 * POST /api/refinement-sessions/[id]/bulk-suggest-subtasks
 *
 * Triggers subtask suggestion generation for all tickets in the session.
 * Runs in the background via after(). Returns the conversation ID immediately.
 *
 * Body: { force?: boolean } - when true, regenerates even if suggestions are up to date.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const session = await db.query.refinementSession.findFirst({
    where: (rs, { eq: eq_ }) => eq_(rs.id, id),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const ticketKeys = JSON.parse(session.ticketKeys) as string[];
  if (ticketKeys.length === 0) {
    return NextResponse.json({ error: "Session has no tickets" }, { status: 400 });
  }

  let force = false;
  try {
    const body = await request.json();
    if (body?.force === true) force = true;
  } catch {
    // empty body is fine
  }

  const convId = conversationIdForSession(id);

  // Create or reuse conversation
  const existingConv = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, convId),
  });
  if (!existingConv) {
    await db.insert(conversation).values({
      id: convId,
      title: `Bulk Subtask Suggestions: ${session.name}`,
      createdAt: new Date().toISOString(),
      metadata: JSON.stringify({ refinementSessionId: id }),
    });
  }

  // Post the user message
  const modeLabel = force ? " (force regenerate)" : "";
  postMessage(
    convId,
    "user",
    `Generate subtask suggestions for ${ticketKeys.length} tickets in session **${session.name}**${modeLabel}.`,
  );

  // Run the bulk job in the background
  after(async () => {
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const key of ticketKeys) {
      try {
        // Fetch ticket data
        const ticketRow = await db
          .select({
            jiraKey: ticket.jiraKey,
            title: ticket.title,
            description: ticket.description,
            acceptanceCriteria: ticket.acceptanceCriteria,
            jiraUpdatedAt: ticket.jiraUpdatedAt,
          })
          .from(ticket)
          .where(eq(ticket.jiraKey, key))
          .get();

        if (!ticketRow) {
          postMessage(convId, "assistant", `Skipped [${key}](/tickets/${key}) - ticket not found in local database.`);
          skipped++;
          emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
          continue;
        }

        const ticketLabel = `[${key}](/tickets/${key}) ${ticketRow.title}`;

        // Smart skip: check if suggestions are already up to date
        if (!force) {
          const latestSuggestion = db
            .select({ createdAt: sql<string>`MAX(${subtaskSuggestion.createdAt})` })
            .from(subtaskSuggestion)
            .where(eq(subtaskSuggestion.ticketKey, key))
            .get();

          if (latestSuggestion?.createdAt && ticketRow.jiraUpdatedAt) {
            const suggestionDate = new Date(latestSuggestion.createdAt).getTime();
            const ticketDate = new Date(ticketRow.jiraUpdatedAt).getTime();
            if (suggestionDate > ticketDate) {
              postMessage(
                convId,
                "assistant",
                `Skipped ${ticketLabel} - suggestions are up to date.`,
              );
              skipped++;
              emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
              continue;
            }
          }
        }

        // Get existing subtask titles to avoid duplicates
        const existingSubtasks = await db
          .select({ title: ticketSubtask.title })
          .from(ticketSubtask)
          .where(eq(ticketSubtask.ticketKey, key))
          .all();
        const existingTitles = existingSubtasks.map((s) => s.title);

        // Submit suggest-subtasks skill to VRW
        const taskConversationId = `bulk-suggest-task-${key}-${Date.now()}`;
        const result = await agentFetch("/api/tasks", {
          method: "POST",
          body: {
            skill: "suggest-subtasks",
            conversationId: taskConversationId,
            args: {
              ticketKey: ticketRow.jiraKey,
              ticketTitle: ticketRow.title,
              ticketDescription: ticketRow.description ?? "",
              acceptanceCriteria: ticketRow.acceptanceCriteria ?? "",
              existingSubtasks: JSON.stringify(existingTitles),
            },
          },
          retries: 2,
        });

        if (!result.ok) {
          postMessage(convId, "assistant", `Failed: ${ticketLabel} - ${result.error.error}`);
          failed++;
          emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
          continue;
        }

        const taskData = result.data as Record<string, unknown>;
        const taskId = typeof taskData.id === "string" ? taskData.id : null;

        if (!taskId) {
          postMessage(convId, "assistant", `Failed: ${ticketLabel} - no task ID returned.`);
          failed++;
          emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
          continue;
        }

        // Stream the result
        const { output, error: taskError } = await captureSubtaskResult(taskId);

        if (taskError || !output) {
          postMessage(convId, "assistant", `Failed: ${ticketLabel} - ${taskError ?? "no output"}`);
          failed++;
          emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
          continue;
        }

        // Parse and persist suggestions
        const titles = parseSubtaskSuggestions(output);

        // Replace existing suggestions
        await db.delete(subtaskSuggestion).where(eq(subtaskSuggestion.ticketKey, key));

        if (titles.length > 0) {
          const now = new Date().toISOString();
          const rows = titles.map((title) => ({
            id: randomUUID(),
            ticketKey: key,
            title,
            createdAt: now,
          }));
          await db.insert(subtaskSuggestion).values(rows);
        }

        postMessage(
          convId,
          "assistant",
          `Generated ${titles.length} suggestion${titles.length !== 1 ? "s" : ""} for ${ticketLabel}`,
        );
        generated++;
        emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        logger.error("bulk-suggest-subtasks", `Error processing ${key}`, errMsg);
        postMessage(convId, "assistant", `Failed: [${key}](/tickets/${key}) - ${errMsg}`);
        failed++;
        emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: id, ticketKey: key });
      }
    }

    // Summary message
    const parts: string[] = [];
    if (generated > 0) parts.push(`${generated} generated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (failed > 0) parts.push(`${failed} failed`);

    postMessage(
      convId,
      "assistant",
      `Bulk suggestion complete. ${parts.join(", ")} (${ticketKeys.length} total).`,
    );

    emitRefinementEvent({ type: "bulk-suggest:complete", sessionId: id });

    // Mark conversation as unread
    await db.update(conversation).set({ readAt: null }).where(eq(conversation.id, convId));

    createNotification(
      "bulk-suggest-subtasks-ready",
      `Bulk subtask suggestions ready for ${session.name}`,
      { category: "agent", linkUrl: `/refinement` },
    );

    logger.info("bulk-suggest-subtasks", "bulk_complete", {
      sessionId: id,
      generated,
      skipped,
      failed,
      total: ticketKeys.length,
    });
  });

  return NextResponse.json({ conversationId: convId }, { status: 202 });
}

/**
 * GET /api/refinement-sessions/[id]/bulk-suggest-subtasks
 *
 * Returns the conversation ID and running status for the bulk suggest job.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const convId = conversationIdForSession(id);

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, convId),
  });

  if (!conv) {
    return NextResponse.json({ conversationId: null, hasRun: false, isRunning: false });
  }

  // Check the last message to determine if job is still running
  const lastMsg = db
    .select({ content: message.content, role: message.role })
    .from(message)
    .where(eq(message.conversationId, convId))
    .orderBy(sql`${message.sequence} DESC`)
    .limit(1)
    .get();

  const isRunning = lastMsg
    ? lastMsg.role === "assistant" && !lastMsg.content.startsWith("Bulk suggestion complete")
    : false;

  return NextResponse.json({ conversationId: convId, hasRun: true, isRunning });
}
