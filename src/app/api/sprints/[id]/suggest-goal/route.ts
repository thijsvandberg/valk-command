import { NextRequest, NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

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

  let body: { sprintName?: string; tickets?: TicketInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sprintName = body.sprintName ?? `Sprint ${sprintId}`;
  const tickets = Array.isArray(body.tickets) ? body.tickets : [];

  if (tickets.length === 0) {
    return NextResponse.json({ error: "No tickets provided" }, { status: 400 });
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
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;

  return NextResponse.json({ taskId });
}
