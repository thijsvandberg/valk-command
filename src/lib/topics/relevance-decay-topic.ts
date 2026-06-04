/**
 * "Relevance decay" deep-scan topic (BRDG-288), topic #5 in the Backlog
 * Deprecation Review epic (docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * This is the most subjective topic: the workspace agent reads the ticket against
 * the current product context (PRD + product spec in docs/plans/) and judges
 * whether the work still makes sense today. Because it is an AI opinion rather
 * than an objective signal, its contribution to scanOverall is CAPPED LOW so it
 * can NEVER alone push a ticket past the candidate threshold (0.6).
 *
 * CAP MATH (weight=1, maxContribution=0.3, threshold=0.6):
 *   Worst case: only this topic scores, score=1.0 (maximum relevance decay).
 *   numerator = min(1.0 * 1, 0.3) = 0.3
 *   denominator = 1
 *   overall = 0.3 / 1 = 0.3 < 0.6 -> never flags alone.
 *
 *   With one corroborating topic (e.g. staleness, weight=1, score=1.0, no cap):
 *   numerator = 0.3 + min(1.0 * 1, 1) = 0.3 + 1.0 = 1.3
 *   denominator = 2
 *   overall = 1.3 / 2 = 0.65 >= 0.6 -> crosses the threshold.
 *
 * The "investigate" skill is used because it runs a focused research task in the
 * workspace, which has access to the project docs (including the PRD and product
 * spec) and can reason about current product direction without needing to search
 * arbitrary code.
 */

import "server-only";
import { logger } from "@/lib/logger";
import {
  registerTopicScorer,
  type DeprecationTopicScorer,
  type DeprecationTicketContext,
  type TopicScoreResult,
} from "@/lib/deprecation-topics";
import { runAgentTaskToCompletion, type RunAgentTaskOptions } from "@/lib/agent-task-result";

// ---------------------------------------------------------------------------
// Cap / weight constants (exported for tests)
// ---------------------------------------------------------------------------

/** Relative importance of this topic in the weighted combination. */
export const RELEVANCE_DECAY_WEIGHT = 1;

/**
 * Hard cap on this topic's contribution to scanOverall. Must be below the
 * candidate threshold (0.6) so relevance-decay alone can NEVER reach it.
 * See CAP MATH in the file header.
 */
export const RELEVANCE_DECAY_MAX_CONTRIBUTION = 0.3;

// ---------------------------------------------------------------------------
// Injectable agent runner (test override)
// ---------------------------------------------------------------------------

/** Runs a workspace agent task to completion. Injectable for tests. */
export type RunAgentFn = (
  request: { skill: string; args: Record<string, unknown>; conversationId: string },
  options?: RunAgentTaskOptions,
) => Promise<{ ok: boolean; output?: string; reason?: string; error?: string }>;

let activeRunAgent: RunAgentFn = runAgentTaskToCompletion;

/** Test-only: swap the agent runner. */
export function _setRunAgentFn(fn: RunAgentFn): void {
  activeRunAgent = fn;
}

/** Test-only: restore the real agent runner. */
export function _resetRunAgentFn(): void {
  activeRunAgent = runAgentTaskToCompletion;
}

// ---------------------------------------------------------------------------
// Agent prompt + response parsing
// ---------------------------------------------------------------------------

/**
 * Build a focused investigate prompt. The agent has access to the product docs
 * (including docs/plans/2026-03-27-valk-command-prd.md and the epic). A short,
 * anchored question minimises hallucination and keeps the response parseable.
 * WHY "investigate": that skill has doc-reading access in the workspace, which
 * makes it the right choice over "ask" (which has no codebase context) or
 * "codebase-research" (which is code-search, not doc-comprehension).
 */
export function buildRelevanceDecayPrompt(ticket: DeprecationTicketContext): string {
  const description = (ticket.description ?? "").slice(0, 1200);
  return [
    `Backlog ticket ${ticket.jiraKey}: "${ticket.title}"`,
    description ? `Description: ${description}` : "",
    ``,
    `Context: Read docs/plans/2026-03-27-valk-command-prd.md and the epic plan`,
    `docs/plans/2026-06-04-backlog-deprecation-review-epic.md to understand the`,
    `current product direction for Bridge (the PO Command Center).`,
    ``,
    `Question: Does this ticket still fit the CURRENT product direction?`,
    `Consider whether the flow, integration, or feature it describes still has`,
    `a place in the product — or whether it targets something the product no`,
    `longer offers, has pivoted away from, or is clearly out-of-scope today.`,
    ``,
    `Respond with EXACTLY three lines and nothing else:`,
    `RELEVANCE: HIGH or LOW or UNCLEAR`,
    `SCORE: a decimal between 0.0 (still very relevant) and 1.0 (clearly obsolete)`,
    `RATIONALE: one short sentence (max 140 chars) explaining the verdict.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export interface ParsedRelevanceResult {
  score: number;
  rationale: string;
  /** Raw relevance label returned by the agent. */
  relevance: "HIGH" | "LOW" | "UNCLEAR" | "UNPARSEABLE";
}

/**
 * Parse the agent's three-line answer into a score and rationale. An
 * unparseable answer returns score=0 (still relevant) so that a bad agent
 * response never falsely promotes a ticket — the safe side is "no opinion".
 */
export function parseRelevanceDecayResult(output: string): ParsedRelevanceResult {
  const relMatch = output.match(/RELEVANCE:\s*(HIGH|LOW|UNCLEAR)/i);
  const scoreMatch = output.match(/SCORE:\s*([0-9]*\.?[0-9]+)/i);
  const ratMatch = output.match(/RATIONALE:\s*(.+)/i);

  if (!relMatch || !scoreMatch) {
    return {
      score: 0,
      rationale: "Could not assess relevance (agent response unparseable).",
      relevance: "UNPARSEABLE",
    };
  }

  const relevance = relMatch[1].toUpperCase() as "HIGH" | "LOW" | "UNCLEAR";
  const rawScore = parseFloat(scoreMatch[1]);
  // Clamp to 0..1 regardless of what the agent returns.
  const score = Math.min(1, Math.max(0, isNaN(rawScore) ? 0 : rawScore));

  let rationale = ratMatch
    ? ratMatch[1].replace(/^["'`*\s]+|["'`*\s]+$/g, "").trim()
    : "";
  rationale = rationale.slice(0, 140);
  if (!rationale) {
    rationale =
      relevance === "HIGH"
        ? "Ticket targets a flow the product no longer offers."
        : "Ticket appears consistent with current product direction.";
  }

  return { score, rationale, relevance };
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export const RELEVANCE_DECAY_TOPIC: DeprecationTopicScorer = {
  key: "relevance",
  label: "Relevance decay",
  weight: RELEVANCE_DECAY_WEIGHT,
  // Capped well below the candidate threshold so this subjective AI judgement
  // can never flag a ticket on its own. See CAP MATH in the file header.
  maxContribution: RELEVANCE_DECAY_MAX_CONTRIBUTION,

  async run(ticket: DeprecationTicketContext, ctx): Promise<TopicScoreResult | null> {
    const prompt = buildRelevanceDecayPrompt(ticket);

    const result = await activeRunAgent(
      {
        skill: "investigate",
        args: { prompt },
        conversationId: `relevance-decay-${ticket.jiraKey}-${ctx.now}`,
      },
    );

    if (!result.ok) {
      // Degrade gracefully: agent unavailable or failed. Abstain rather than
      // falsely scoring the ticket. The ticket remains available for re-scan.
      logger.warn("relevance-decay-topic", "agent investigate unavailable; abstaining", {
        jiraKey: ticket.jiraKey,
        reason: result.reason,
      });
      return null;
    }

    const parsed = parseRelevanceDecayResult(result.output ?? "");

    if (parsed.relevance === "UNPARSEABLE") {
      // A structurally invalid response is treated as no opinion, not as
      // "very relevant". The safe default is abstain, not score.
      logger.warn("relevance-decay-topic", "agent returned unparseable response; abstaining", {
        jiraKey: ticket.jiraKey,
      });
      return null;
    }

    if (parsed.score < 0.15) {
      // Score near zero means the agent judged the ticket still relevant.
      // Abstain rather than diluting the weighted average with a near-zero score
      // that would actually lower the overall for tickets with other signals.
      return null;
    }

    return {
      score: parsed.score,
      evidence: { relevance: parsed.relevance },
      rationale: parsed.rationale,
    };
  },
};

registerTopicScorer(RELEVANCE_DECAY_TOPIC);
