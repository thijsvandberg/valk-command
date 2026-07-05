import { NextResponse, after } from "next/server";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { guardTestDocDraftKey } from "@/lib/test-doc-routes";
import { kickoffTestDocGeneration, persistTestDocDraftWhenDone } from "@/lib/test-doc-background";

/**
 * POST /api/tickets/[key]/generate-test-doc
 *
 * Gathers the full ticket context (description, ALL comments, recent status
 * changes) and submits the generate-test-doc skill to VRW (BRDG-426). Returns
 * a taskId for streaming. Comments are a primary input: preconditions, test
 * data and environment caveats usually live there, not in the description.
 * The context-gather + dispatch lives in kickoffTestDocGeneration so the
 * BRDG-471 auto-trigger reuses the exact same generation path.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const key = resolveDraftKey(rawKey);
  const draftBlocked = guardTestDocDraftKey(key, "generate");
  if (draftBlocked) return draftBlocked;

  const kickoff = await kickoffTestDocGeneration(key);
  if (kickoff.status === "not_found") {
    return errorResponse("Ticket not found", 404);
  }
  if (kickoff.status === "agent_error") {
    return agentErrorResponse(kickoff.error, kickoff.httpStatus);
  }

  const { taskId, streamUrl } = kickoff;

  // Server-side completion capture: the draft lands in Bridge even when the
  // PO fired this from the status line (fire-and-forget) or closed the modal.
  if (taskId) {
    after(() => persistTestDocDraftWhenDone(key, taskId));
  }

  return NextResponse.json({ taskId, streamUrl }, { status: 202 });
}
