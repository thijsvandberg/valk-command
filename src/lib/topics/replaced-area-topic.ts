/**
 * "Replaced / obsolete area" deep-scan topic (BRDG-285), the first real Tier-2
 * scorer. See docs/plans/2026-06-04-backlog-deprecation-review-epic.md.
 *
 * Pipeline: load the editable deprecated-area list -> keyword-match the ticket
 * (cheap, local) -> on a match, ask the workspace agent to confirm the ticket is
 * genuinely about the retired area (guards against incidental mentions) ->
 * combine into a score + one-line rationale + matched-term evidence.
 *
 * This SUPERSEDES the EXAMPLE_RETIRED_AREA_SCORER stub in deprecation-topics.ts:
 * it registers under the same `replaced` key, so importing this module replaces
 * the example in the registry. The stub remains only as a documented template.
 */
import { db } from "@/db";
import { deprecatedAreaKeyword } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  registerTopicScorer,
  type DeprecationTopicScorer,
  type DeprecationTicketContext,
  type TopicScoreResult,
} from "@/lib/deprecation-topics";
import { matchDeprecatedAreas, type DeprecatedArea } from "@/lib/deprecated-area-matcher";
import { runAgentTaskToCompletion } from "@/lib/agent-task-result";
import {
  buildConfirmationPrompt,
  parseConfirmation,
  type ConfirmationInput,
  type ConfirmationOutcome,
} from "@/lib/topics/replaced-area-confirmation";

/**
 * Confirmation function type. Injectable so tests exercise the scorer end-to-end
 * without the agent. The default talks to the real workspace agent.
 */
export type ConfirmFn = (input: ConfirmationInput) => Promise<ConfirmationOutcome | null>;

/** Default: submit the confirm skill, block for the result, parse it. */
async function confirmViaAgent(input: ConfirmationInput): Promise<ConfirmationOutcome | null> {
  const result = await runAgentTaskToCompletion({
    skill: "ask",
    args: { prompt: buildConfirmationPrompt(input) },
    conversationId: `replaced-area-${input.jiraKey}-${Date.now()}`,
  });
  if (!result.ok) {
    logger.warn("replaced-area-topic", "agent confirmation unavailable", {
      jiraKey: input.jiraKey,
      reason: result.reason,
    });
    return null;
  }
  return parseConfirmation(result.output);
}

let activeConfirm: ConfirmFn = confirmViaAgent;

/** Test-only: swap the confirmation function (e.g. a mock). */
export function _setConfirmFn(fn: ConfirmFn): void {
  activeConfirm = fn;
}

/** Test-only: restore the real agent-backed confirmation. */
export function _resetConfirmFn(): void {
  activeConfirm = confirmViaAgent;
}

/** Loader for the editable list. Tests can override to avoid a DB round-trip. */
export type LoadAreasFn = () => Promise<DeprecatedArea[]>;

async function loadAreasFromDb(): Promise<DeprecatedArea[]> {
  const rows = await db
    .select({ term: deprecatedAreaKeyword.term, aliases: deprecatedAreaKeyword.aliases })
    .from(deprecatedAreaKeyword)
    .all();
  return rows;
}

let activeLoadAreas: LoadAreasFn = loadAreasFromDb;

/** Test-only: swap the area loader. */
export function _setLoadAreasFn(fn: LoadAreasFn): void {
  activeLoadAreas = fn;
}

/** Test-only: restore the DB-backed loader. */
export function _resetLoadAreasFn(): void {
  activeLoadAreas = loadAreasFromDb;
}

interface ReplacedAreaEvidence {
  /** Canonical retired-area terms that matched. */
  matchedAreas: string[];
  /** Concrete surface forms that hit, lowercased. */
  matchedTerms: string[];
  /** Whether the AI confirmed it; null when the agent was unavailable. */
  aiConfirmed: boolean | null;
  /** True when the score fell back to the matcher prior (agent unavailable). */
  degraded: boolean;
}

export const REPLACED_AREA_TOPIC: DeprecationTopicScorer = {
  key: "replaced",
  label: "Replaced area",
  weight: 1,
  // No special cap: an AI-confirmed retired-area match is a strong, objective
  // signal and may legitimately push a ticket to candidate on its own.
  async run(ticket: DeprecationTicketContext): Promise<TopicScoreResult | null> {
    const areas = await activeLoadAreas();
    const { baseScore, matches } = matchDeprecatedAreas(ticket, areas);

    // No keyword hit => the topic has no opinion; abstain so it does not dilute
    // the weighted average for unrelated tickets.
    if (matches.length === 0) return null;

    const matchedAreas = matches.map((m) => m.term);
    const matchedTerms = [...new Set(matches.flatMap((m) => m.matchedTerms))];

    const outcome = await activeConfirm({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      description: ticket.description,
      matchedAreas,
    });

    // Degraded path: agent unavailable/errored. Keep the matcher prior but pull
    // it down so an unconfirmed match cannot alone cross the candidate threshold.
    if (!outcome) {
      const degradedScore = Math.min(baseScore, 0.5);
      const evidence: ReplacedAreaEvidence = {
        matchedAreas,
        matchedTerms,
        aiConfirmed: null,
        degraded: true,
      };
      return {
        score: degradedScore,
        evidence,
        rationale: `Mentions retired area(s) ${matchedAreas.join(", ")} (AI confirmation unavailable)`,
      };
    }

    // Confirmed: lift toward the matcher's high end. Not confirmed: the agent
    // judged the mention incidental, so collapse the score so it does not flag.
    const score = outcome.confirmed ? Math.max(baseScore, 0.8) : 0.15;
    const evidence: ReplacedAreaEvidence = {
      matchedAreas,
      matchedTerms,
      aiConfirmed: outcome.confirmed,
      degraded: false,
    };

    return {
      score,
      evidence,
      rationale: outcome.rationale,
    };
  },
};

registerTopicScorer(REPLACED_AREA_TOPIC);
