/**
 * Consolidated deprecation analyzer (BRDG-298, see
 * docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * WHY this exists: the epic's Tier-2 deep dive originally ran one agent call per
 * topic (replaced-area, superseded, already-built, relevance-decay) with ad-hoc
 * prompts. That is up to four agent round-trips per ticket. The VRW
 * `analyze-deprecation` skill does all of it in ONE focused pass and ALSO returns
 * a revival assessment (the opposite conclusion: a low-backlog ticket worth
 * pulling up because it fits recent/planned work). This module is the single
 * call: it submits that skill, parses the structured block, and maps the result
 * into the per-topic scanScores shape plus a revival verdict.
 *
 * WIRING: runDeepScan PREFERS this consolidated analyzer. The per-topic scorers
 * in src/lib/topics/ remain registered and serve as the FALLBACK path used when
 * the analyzer is unavailable (agent down) or returns nothing parseable. Nothing
 * is deleted; the two paths produce the same scanScores topic keys.
 *
 * Never throws: an agent failure or unparseable response returns null so the
 * caller can fall back to the registered per-topic scorers.
 */
import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runAgentTaskToCompletion, type RunAgentTaskOptions } from "@/lib/agent-task-result";
import {
  parseDeprecationAnalysis,
  type ParsedDeprecationAnalysis,
} from "@/lib/parse-deprecation-analysis";
import type { DeprecationTicketContext } from "@/lib/deprecation-topics";
import type { ScanTopicKey } from "@/lib/cleanup-types";

/** A topic entry as stored in scanScores: score + optional evidence + rationale. */
export interface AnalyzerTopicEntry {
  score: number;
  evidence?: unknown;
  rationale?: string;
}

export interface AnalyzerResult {
  /** Per-topic entries ready to merge into scanScores. */
  topicScores: Partial<Record<ScanTopicKey, AnalyzerTopicEntry>>;
  /** Revival verdict (the opposite-of-deprecation signal). */
  revival: {
    score: number;
    rationale: string;
    relatedKeys: string[];
  };
  /** Human-readable one-paragraph read from the skill. */
  summary: string;
}

/**
 * Score below which a topic is treated as "no opinion" and dropped, mirroring the
 * abstain behaviour of the per-topic scorers. WHY: a near-zero topic score should
 * not dilute the weighted average in combineTopicScores — the scorers abstain
 * (return null) in that case, so the analyzer must do the same to stay consistent.
 */
const TOPIC_ABSTAIN_BELOW = 0.15;

/**
 * Map a parsed analysis into the scanScores topic shape. Topics scoring below the
 * abstain threshold are omitted so they do not contribute to the combination.
 * `duplicate` carries its survivor key as structured evidence so the review
 * screen can link it (matching the per-topic scorer's evidence contract).
 */
export function mapAnalysisToResult(parsed: ParsedDeprecationAnalysis): AnalyzerResult {
  const topicScores: Partial<Record<ScanTopicKey, AnalyzerTopicEntry>> = {};

  for (const [key, topic] of Object.entries(parsed.topics)) {
    if (!topic) continue;
    if (topic.score < TOPIC_ABSTAIN_BELOW) continue;

    const evidence: Record<string, unknown> = {};
    if (topic.evidence) evidence.note = topic.evidence;
    if (key === "duplicate" && topic.supersededBy) {
      evidence.supersededBy = topic.supersededBy;
    }

    topicScores[key as ScanTopicKey] = {
      score: topic.score,
      rationale: topic.rationale || undefined,
      evidence: Object.keys(evidence).length > 0 ? evidence : undefined,
    };
  }

  return {
    topicScores,
    revival: {
      score: parsed.revival.score,
      rationale: parsed.revival.rationale,
      relatedKeys: parsed.revival.relatedKeys,
    },
    summary: parsed.summary,
  };
}

/** Injectable agent runner so tests exercise mapping without the network. */
export type RunAgentFn = typeof runAgentTaskToCompletion;

let activeRunAgent: RunAgentFn = runAgentTaskToCompletion;
// True while the default (real agent) runner is in place. Tests that inject a
// mock flip this so the agent-configuration guard does not short-circuit them.
let usingDefaultRunner = true;

/** Test-only: swap the agent runner. */
export function _setRunAgentFn(fn: RunAgentFn): void {
  activeRunAgent = fn;
  usingDefaultRunner = false;
}

/** Test-only: restore the real agent runner. */
export function _resetRunAgentFn(): void {
  activeRunAgent = runAgentTaskToCompletion;
  usingDefaultRunner = true;
}

/**
 * Run the consolidated `analyze-deprecation` skill for one ticket and map the
 * result. Returns null on agent failure or an unparseable response, so the caller
 * falls back to the registered per-topic scorers.
 */
export async function runConsolidatedAnalysis(
  ticket: DeprecationTicketContext,
  options: { now?: number; pollOptions?: RunAgentTaskOptions } = {},
): Promise<AnalyzerResult | null> {
  const now = options.now ?? Date.now();

  // Skip fast when the workspace agent is not configured (e.g. tests, local runs
  // without VALK_AGENT_KEY). Returning null here lets runDeepScan fall straight
  // through to the registered per-topic scorers instead of paying the agentFetch
  // retry/backoff cost on a call that cannot succeed. A test-injected runner
  // bypasses this guard so unit tests exercise the mapping without env setup.
  if (usingDefaultRunner && !env.VALK_AGENT_KEY) {
    return null;
  }

  const description = (ticket.description ?? "").slice(0, 2000);

  const result = await activeRunAgent(
    {
      skill: "analyze-deprecation",
      args: {
        key: ticket.jiraKey,
        summary: ticket.title,
        description,
      },
      conversationId: `analyze-deprecation-${ticket.jiraKey}-${now}`,
    },
    options.pollOptions,
  );

  if (!result.ok) {
    logger.warn("deprecation-analyzer", "consolidated analysis unavailable; will fall back", {
      jiraKey: ticket.jiraKey,
      reason: result.reason,
    });
    return null;
  }

  const parsed = parseDeprecationAnalysis(result.output);
  if (!parsed) {
    logger.warn("deprecation-analyzer", "unparseable analysis; will fall back", {
      jiraKey: ticket.jiraKey,
    });
    return null;
  }

  return mapAnalysisToResult(parsed);
}
