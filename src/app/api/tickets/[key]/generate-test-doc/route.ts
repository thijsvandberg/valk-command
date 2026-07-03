import { NextResponse, after } from "next/server";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { db } from "@/db";
import { ticket, ticketLocalEdit, jiraComment, ticketStatusChange } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { isDraftKey } from "@/lib/draft-key";
import { logger } from "@/lib/logger";
import { persistTestDocDraftWhenDone } from "@/lib/test-doc-background";

// Recent transitions give the skill testing context (what moved to Test and
// when) without dumping the ticket's whole history into the prompt.
const MAX_STATUS_CHANGES = 10;

/**
 * POST /api/tickets/[key]/generate-test-doc
 *
 * Gathers the full ticket context (description, ALL comments, recent status
 * changes) and submits the generate-test-doc skill to VRW (BRDG-426). Returns
 * a taskId for streaming. Comments are a primary input: preconditions, test
 * data and environment caveats usually live there, not in the description.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const key = resolveDraftKey(rawKey);
  if (isDraftKey(key)) {
    return errorResponse("Cannot generate test documentation for a draft ticket", 409);
  }

  const ticketRow = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      description: ticket.description,
    })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!ticketRow) {
    return errorResponse("Ticket not found", 404);
  }

  // The PO's unpushed description edit is the truth being tested; prefer it
  // over the (older) Jira mirror when present.
  const localDescription = await db
    .select({ localValue: ticketLocalEdit.localValue })
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, "description")))
    .get();

  const comments = await db
    .select({
      author: jiraComment.authorName,
      createdAt: jiraComment.createdAt,
      content: jiraComment.content,
    })
    .from(jiraComment)
    .where(eq(jiraComment.ticketKey, key))
    .orderBy(asc(jiraComment.createdAt))
    .all();

  const statusChanges = await db
    .select({
      fromStatus: ticketStatusChange.fromStatus,
      toStatus: ticketStatusChange.toStatus,
      changedAt: ticketStatusChange.changedAt,
    })
    .from(ticketStatusChange)
    .where(eq(ticketStatusChange.ticketKey, key))
    .orderBy(desc(ticketStatusChange.changedAt))
    .limit(MAX_STATUS_CHANGES)
    .all();

  const conversationId = `generate-test-doc-${key}-${Date.now()}`;

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: "generate-test-doc",
      conversationId,
      args: {
        ticketKey: ticketRow.jiraKey,
        ticketTitle: ticketRow.title,
        ticketType: ticketRow.type ?? "story",
        ticketDescription: localDescription?.localValue ?? ticketRow.description ?? "",
        comments: JSON.stringify(comments),
        statusChanges: JSON.stringify(statusChanges),
      },
    },
    retries: 2,
  });

  if (!result.ok) {
    logger.error("generate-test-doc", "Failed to invoke generate-test-doc skill", result.error.error);
    return agentErrorResponse(result.error, result.status);
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;
  const streamUrl = taskId ? `/api/workspace-tasks/${taskId}/stream` : null;

  // Server-side completion capture: the draft lands in Bridge even when the
  // PO fired this from the status line (fire-and-forget) or closed the modal.
  if (taskId) {
    after(() => persistTestDocDraftWhenDone(key, taskId));
  }

  return NextResponse.json({ taskId, streamUrl }, { status: 202 });
}
