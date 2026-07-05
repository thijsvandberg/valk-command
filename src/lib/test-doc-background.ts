import { db } from "@/db";
import {
  ticket,
  ticketMetadata,
  ticketLocalEdit,
  jiraComment,
  ticketStatusChange,
  ticketSprint,
  sprintSlot,
} from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { agentFetch, type AgentError } from "@/lib/agent-fetch";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { parseTestDoc, type TestDocClassification } from "@/lib/parse-test-doc";
import { emitTicketEvent } from "@/lib/ticket-events";
import { isDraftKey } from "@/lib/draft-key";
import { deriveTestDocState } from "@/lib/test-doc";

/**
 * Persist a generated (not yet reviewed) test doc into the Bridge draft cache
 * (BRDG-426). Shared by the client-facing draft route and the server-side
 * background capture below. Bridge-local: no Jira write.
 */
export async function writeTestDocDraft(
  key: string,
  markdown: string,
  classification: TestDocClassification,
): Promise<void> {
  const draft = {
    testDocDraft: markdown.trim(),
    testDocDraftClassification: classification,
    testDocDraftGeneratedAt: new Date().toISOString(),
  };
  await db
    .insert(ticketMetadata)
    .values({ jiraKey: key, ...draft })
    .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: draft });

  // The board-row test-doc marker derives from this state; drop the cached
  // list + detail responses so the next revalidation reflects the new draft.
  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // A server-side draft write (auto-generation, BRDG-471) has no client poll
  // behind it, so tell open views to revalidate the same way a sync does. The
  // status-change queue listens for "test_doc" and re-runs, surfacing the
  // persistent "draft ready to accept" line without a manual refresh.
  emitTicketEvent({ type: "ticket:changed", ticketKey: key, kinds: ["test_doc"], origin: null });
}

// Recent transitions give the skill testing context (what moved to Test and
// when) without dumping the ticket's whole history into the prompt.
const MAX_STATUS_CHANGES = 10;

export type TestDocKickoffResult =
  | { status: "started"; taskId: string | null; streamUrl: string | null }
  | { status: "not_found" }
  | { status: "agent_error"; error: AgentError; httpStatus: number };

/**
 * Gather the full ticket context (description, ALL comments, recent status
 * changes) and submit the generate-test-doc skill to VRW (BRDG-426). Returns
 * the started task's id; does NOT schedule the completion capture — the caller
 * owns that (the route via `after()`, the auto-trigger via a bare `void`), so
 * this helper is reusable from both a request and a background sync.
 */
export async function kickoffTestDocGeneration(key: string): Promise<TestDocKickoffResult> {
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

  if (!ticketRow) return { status: "not_found" };

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
    return { status: "agent_error", error: result.error, httpStatus: result.status };
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;
  const streamUrl = taskId ? `/api/workspace-tasks/${taskId}/stream` : null;
  return { status: "started", taskId, streamUrl };
}

// Server-side guard so a ticket entering Test via several near-simultaneous sync
// passes only kicks off one background generation. Per-process (single-node
// Bridge); a completed/failed/cancelled capture clears the key in the finally.
const autoGenInFlight = new Set<string>();

async function isInPinnedSprint(key: string): Promise<boolean> {
  const row = await db
    .select({ sprintId: ticketSprint.sprintId })
    .from(ticketSprint)
    .innerJoin(sprintSlot, eq(sprintSlot.sprintId, ticketSprint.sprintId))
    .where(eq(ticketSprint.ticketKey, key))
    .get();
  return !!row;
}

/**
 * Auto-generate a test-doc DRAFT when a pinned-sprint ticket enters Test
 * (BRDG-471). Fire-and-forget from the two status-transition detection points
 * (Jira-origin sync in upsertIssue, Bridge-origin PUT status route); never
 * throws. No-ops unless EVERY gate holds: a real (non-draft) key, the ticket is
 * in a pinned sprint, there is no existing doc / draft / not-needed marker, and
 * no generation is already in flight. Produces only a draft — acceptance (which
 * writes Jira) stays a deliberate PO action.
 */
export async function maybeAutoGenerateTestDoc(key: string): Promise<void> {
  try {
    if (isDraftKey(key)) return;
    if (autoGenInFlight.has(key)) return;

    const meta = await db
      .select({
        testDoc: ticketMetadata.testDoc,
        testDocDraft: ticketMetadata.testDocDraft,
        testDocClassification: ticketMetadata.testDocClassification,
      })
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, key))
      .get();
    // Never clobber an accepted doc, an existing draft, or a not-needed marker.
    if (deriveTestDocState(meta) !== null) return;

    if (!(await isInPinnedSprint(key))) return;

    autoGenInFlight.add(key);
    const kickoff = await kickoffTestDocGeneration(key);
    if (kickoff.status === "started" && kickoff.taskId) {
      // Bare void (not after()): upsertIssue runs in non-request background sync
      // where after() may never fire. On a persistent Node server the promise
      // runs to completion; its finally clears the in-flight guard.
      void persistTestDocDraftWhenDone(key, kickoff.taskId);
    } else {
      // Nothing was scheduled to clear the guard; release it now.
      autoGenInFlight.delete(key);
    }
  } catch (err) {
    autoGenInFlight.delete(key);
    logger.error(
      "generate-test-doc",
      `Auto-generation gate failed for ${key}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}

const POLL_INTERVAL_MS = 3000;
// Generations typically take 1-4 min; give up after ~6 so a hung task never
// keeps a server-side loop alive indefinitely.
const MAX_ATTEMPTS = 120;

// Read at call time (not module init, unlike query-timer's resolveThreshold)
// so tests can stub the env per case without re-importing the module.
function readEnvInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-side completion capture for a generate-test-doc task: polls the
 * workspace until the task finishes and persists the parsed doc as a draft.
 * Runs via `after()` from the generate route, so the draft lands even when
 * the PO fired the generation from the status line and navigated away (the
 * review modal's own draft write is an idempotent duplicate of this).
 * Never throws — a lost background capture only costs a regeneration.
 */
export async function persistTestDocDraftWhenDone(
  key: string,
  taskId: string,
  opts: { pollIntervalMs?: number; maxAttempts?: number; sleepFn?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const {
    pollIntervalMs = readEnvInt("TEST_DOC_POLL_INTERVAL_MS", POLL_INTERVAL_MS),
    maxAttempts = readEnvInt("TEST_DOC_POLL_MAX_ATTEMPTS", MAX_ATTEMPTS),
    sleepFn = sleep,
  } = opts;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleepFn(pollIntervalMs);
      const poll = await agentFetch<Record<string, unknown>>(`/api/tasks/${taskId}`);
      // Transient poll errors are not fatal; keep trying until attempts run out.
      if (!poll.ok) continue;
      const status = poll.data?.status;
      // Cancellation is a deliberate PO action (the review modal cancels
      // in-flight tasks on close); only a genuine failure deserves an error.
      if (status === "cancelled") return;
      if (status === "failed") {
        logger.error("generate-test-doc", `Background generation failed for ${key} (task ${taskId})`);
        return;
      }
      if (status !== "completed") continue;

      const output = typeof poll.data?.output === "string" ? poll.data.output : "";
      const parsed = parseTestDoc(output);
      // Unstructured output is still worth caching: the PO can salvage it by
      // hand in the review modal instead of paying for a regeneration.
      const markdown = parsed ? parsed.markdown : output.trim();
      if (markdown) {
        await writeTestDocDraft(key, markdown, parsed?.classification ?? "ok");
      }
      return;
    }
    logger.error("generate-test-doc", `Background capture timed out for ${key} (task ${taskId})`);
  } catch (err) {
    logger.error(
      "generate-test-doc",
      `Background capture failed for ${key} (task ${taskId}): ${err instanceof Error ? err.message : "unknown"}`,
    );
  } finally {
    // Release the auto-generation guard on every exit (success, timeout,
    // cancel, failure). Harmless for the manual/route path (never added).
    autoGenInFlight.delete(key);
  }
}
