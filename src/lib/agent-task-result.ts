import "server-only";
import { agentFetch } from "@/lib/agent-fetch";
import { logger } from "@/lib/logger";

/**
 * Submit a workspace skill/task and block until it completes, returning the
 * agent's final text output.
 *
 * WHY a dedicated helper: server-side scan topics (BRDG-285..288) need a
 * COMPLETED result, not a streamed UI task. The proven pattern already used by
 * `/api/epics/generate-summaries` is submit (`POST /api/tasks`) then poll
 * (`GET /api/tasks/:id`) until `status === "completed"`. Extracting it here lets
 * every later AI topic reuse one tested, mockable code path instead of
 * re-implementing polling. The agent client (`agentFetch`) is the only external
 * dependency, so tests mock it and never touch the network.
 *
 * Never throws for expected failures: returns a discriminated result so callers
 * can degrade gracefully (e.g. fall back to a heuristic score) instead of
 * sinking the whole scan.
 */

export interface AgentTaskRequest {
  /** Skill name registered on the workspace agent. */
  skill: string;
  /** Skill arguments, passed through to the agent task body. */
  args?: Record<string, unknown>;
  /** Conversation id; defaults to a unique one derived from the skill. */
  conversationId?: string;
}

export type AgentTaskResult =
  | { ok: true; output: string }
  | { ok: false; reason: "submit-failed" | "task-failed" | "timeout"; error: string };

export interface RunAgentTaskOptions {
  /** Max poll attempts before giving up. */
  maxAttempts?: number;
  /** Delay between polls, in ms. */
  pollIntervalMs?: number;
  /** Injectable sleep so tests run instantly without real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 40;
const DEFAULT_POLL_INTERVAL_MS = 3000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAgentTaskToCompletion(
  request: AgentTaskRequest,
  options: RunAgentTaskOptions = {},
): Promise<AgentTaskResult> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    sleep = defaultSleep,
  } = options;

  const conversationId = request.conversationId ?? `${request.skill}-${Date.now()}`;

  const submit = await agentFetch<{ id?: string }>("/api/tasks", {
    method: "POST",
    body: { skill: request.skill, conversationId, args: request.args ?? {} },
    retries: 2,
  });

  if (!submit.ok) {
    return { ok: false, reason: "submit-failed", error: submit.error.error };
  }

  const taskId = submit.data?.id;
  if (!taskId) {
    return { ok: false, reason: "submit-failed", error: "Agent returned no task id" };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    const poll = await agentFetch<Record<string, unknown>>(`/api/tasks/${taskId}`);
    // A transient poll error is not fatal; keep trying until attempts run out.
    if (!poll.ok) continue;

    const task = poll.data;
    if (task.status === "completed") {
      const output = typeof task.output === "string" ? task.output : "";
      return { ok: true, output };
    }
    if (task.status === "failed" || task.status === "cancelled") {
      const error = typeof task.error === "string" ? task.error : `Task ${task.status}`;
      return { ok: false, reason: "task-failed", error };
    }
  }

  logger.warn("agent-task-result", "timed out waiting for task", { skill: request.skill, taskId });
  return { ok: false, reason: "timeout", error: "Timed out waiting for the workspace task" };
}
