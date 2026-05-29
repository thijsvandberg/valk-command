import { NextResponse } from "next/server";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * POST /api/tickets/[key]/suggest-epic
 *
 * Gathers ticket context and all epic summaries, then submits the
 * suggest-epic skill to VRW. Returns a taskId for streaming.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { key } = await params;

  const ticketRow = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      description: ticket.description,
    })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!ticketRow) {
    return errorResponse("Ticket not found", 404);
  }

  const epicRows = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      summary: ticket.summary,
    })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();

  if (epicRows.length === 0) {
    return errorResponse("No epics available", 404);
  }

  const epicsPayload = epicRows.map((e) => ({
    key: e.jiraKey,
    name: e.title,
    summary: e.summary ?? null,
  }));

  const conversationId = `suggest-epic-${key}-${Date.now()}`;

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: "suggest-epic",
      conversationId,
      args: {
        ticketKey: ticketRow.jiraKey,
        ticketTitle: ticketRow.title,
        ticketDescription: ticketRow.description ?? "",
        epics: JSON.stringify(epicsPayload),
      },
    },
    retries: 2,
  });

  if (!result.ok) {
    logger.error("suggest-epic", "Failed to invoke suggest-epic skill", result.error.error);
    return agentErrorResponse(result.error, result.status);
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;
  const streamUrl = taskId ? `/api/workspace-tasks/${taskId}/stream` : null;

  return NextResponse.json({ taskId, streamUrl }, { status: 202 });
}
