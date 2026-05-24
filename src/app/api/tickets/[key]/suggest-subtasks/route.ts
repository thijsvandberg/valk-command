import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * POST /api/tickets/[key]/suggest-subtasks
 *
 * Gathers ticket context and existing subtask titles, then submits the
 * suggest-subtasks skill to VRW. Returns a taskId for streaming.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  const { key } = await params;

  const ticketRow = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
    })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!ticketRow) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const existingSubtasks = await db
    .select({ title: ticketSubtask.title })
    .from(ticketSubtask)
    .where(eq(ticketSubtask.ticketKey, key))
    .all();

  const existingTitles = existingSubtasks.map((s) => s.title);

  const existingList = existingTitles.length > 0
    ? `\n\nExisting subtasks (do not duplicate these):\n${existingTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  const prompt = [
    `Suggest subtasks for Jira ticket ${ticketRow.jiraKey}: ${ticketRow.title}`,
    ticketRow.description ? `\nDescription:\n${ticketRow.description}` : "",
    ticketRow.acceptanceCriteria ? `\nAcceptance Criteria:\n${ticketRow.acceptanceCriteria}` : "",
    existingList,
    "\nRespond with ONLY a numbered list of subtask titles (e.g. \"1. Do something\"). No explanations, no headers, just the list.",
  ].filter(Boolean).join("\n");

  const conversationId = `suggest-subtasks-${key}-${Date.now()}`;

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: "chat",
      conversationId,
      args: prompt,
    },
    retries: 2,
  });

  if (!result.ok) {
    logger.error("suggest-subtasks", "Failed to invoke suggest-subtasks skill", result.error.error);
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;
  const streamUrl = taskId ? `/api/workspace-tasks/${taskId}/stream` : null;

  return NextResponse.json({ taskId, streamUrl }, { status: 202 });
}
