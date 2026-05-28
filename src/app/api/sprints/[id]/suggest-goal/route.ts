import { NextRequest, NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

interface TicketInput {
  key: string;
  summary: string;
  epic?: string;
  type: string;
  storyPoints?: number;
}

/**
 * POST /api/sprints/[id]/suggest-goal
 *
 * Invokes the workspace `suggest-sprint-goal` skill and returns
 * a taskId that the client can stream via GET /api/workspace-tasks/[id]/stream.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  const { id: sprintId } = await params;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { sprintName?: string; tickets?: TicketInput[] };

  const sprintName = body.sprintName ?? `Sprint ${sprintId}`;
  const tickets = Array.isArray(body.tickets) ? body.tickets : [];

  if (tickets.length === 0) {
    return errorResponse("No tickets provided", 400);
  }

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: "suggest-sprint-goal",
      args: {
        sprintName,
        tickets: tickets.map((t) => ({
          key: t.key,
          summary: t.summary,
          epic: t.epic,
          type: t.type,
          storyPoints: t.storyPoints,
        })),
      },
    },
    retries: 2,
  });

  if (!result.ok) {
    logger.error("suggest-goal", "Failed to invoke suggest-sprint-goal skill", result.error.error);
    return agentErrorResponse(result.error, result.status);
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;

  return NextResponse.json({ taskId });
}
