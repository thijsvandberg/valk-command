import { db } from "@/db";
import { ticketMetadata } from "@/db/schema";
import { agentFetch } from "@/lib/agent-fetch";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { parseTestDoc, type TestDocClassification } from "@/lib/parse-test-doc";

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
  }
}
