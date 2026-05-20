import { NextResponse, after } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { agentFetch } from "@/lib/agent-fetch";
import { logActivity } from "@/lib/activity-logger";
import { captureReviewGeneration } from "@/lib/review-capture";

/**
 * POST /api/tickets/[key]/reviews/generate
 *
 * Submits a review-story-json task to the agent and returns immediately
 * with the agent task ID (202 Accepted). The review is processed in the
 * background via after(); clients should poll the workspace-tasks SSE
 * stream at /api/workspace-tasks/[taskId]/stream for completion, then
 * call GET /api/tickets/[key]/reviews to retrieve the result.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let source: "ticket-detail" | "chat" | "bulk-action" = "ticket-detail";
  try {
    const body = await request.json();
    if (body?.source) source = body.source;
  } catch {
    // No body is fine
  }

  const conversationId = `review-${key}-${Date.now()}`;

  const submitResult = await agentFetch<{ id: string }>("/api/tasks", {
    method: "POST",
    body: {
      skill: "review-story-json",
      args: { args: key },
      conversationId,
    },
    retries: 2,
  });

  if (!submitResult.ok) {
    await logActivity({
      type: source === "bulk-action" ? "bulk-action" : "review",
      scope: key,
      status: "failed",
      summary: `Review submission failed for ${key}: ${submitResult.error.code}`,
      errorDetail: JSON.stringify({
        code: submitResult.error.code,
        error: submitResult.error.error,
        httpStatus: submitResult.status,
        retryCount: submitResult.retryCount,
      }),
    });
    return NextResponse.json(
      { error: submitResult.error.error, code: submitResult.error.code },
      { status: submitResult.status || 502 },
    );
  }

  const taskId = submitResult.data.id;

  after(async () => {
    await captureReviewGeneration(taskId, conversationId, key, source);
  });

  return NextResponse.json({ taskId }, { status: 202 });
}
