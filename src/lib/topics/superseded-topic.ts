/**
 * "Duplication / superseded by another ticket" deep-scan topic (BRDG-286), topic
 * #3 in the Backlog Deprecation Review epic
 * (docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * Pipeline: reuse Bridge's existing find-related feature rather than building any
 * new search/caching. For a deep-dive ticket we
 *   1. read the existing `relatedSuggestionCache`; if a fresh entry exists
 *      (within the same 30-min TTL the /related-suggestions route uses) we use it
 *      as-is — no agent call;
 *   2. otherwise run the `find-related` skill to completion via the shared
 *      `runAgentTaskToCompletion` helper, parse it with `parseRelatedStories`,
 *      and persist it into the SAME cache (clear-then-insert, like the route's
 *      PUT) so the UI and re-scans share one cache;
 *   3. enrich each match with its local recency (ticket.jiraUpdatedAt) and apply
 *      the pure `deriveSupersededVerdict` rule.
 *
 * Registers under the `duplicate` SCAN_TOPICS key, so importing this module
 * lights up the Duplicate column.
 */
import "server-only";
import { db } from "@/db";
import { relatedSuggestionCache, ticket } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import {
  registerTopicScorer,
  type DeprecationTopicScorer,
  type DeprecationTicketContext,
  type TopicScoreResult,
} from "@/lib/deprecation-topics";
import { runAgentTaskToCompletion, type RunAgentTaskOptions } from "@/lib/agent-task-result";
import { parseRelatedStories, type RelatedStoryItem } from "@/lib/parse-related-stories";
import {
  deriveSupersededVerdict,
  type SupersededMatch,
} from "@/lib/topics/superseded-verdict";

// Same freshness window the /api/tickets/[key]/related-suggestions route uses.
// Reusing it keeps a single cache contract: a scan never invalidates a UI-fresh
// entry, and a UI request never invalidates a scan-fresh one.
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_SUGGESTIONS = 10;

/** A cached/parsed find-related match, before recency enrichment. */
interface RawMatch {
  key: string;
  score: number;
  title: string;
  status: string;
  reason: string | null;
}

/**
 * Source of find-related matches. Injectable so tests exercise the verdict +
 * evidence end-to-end without the agent or a real cache. The default reads the
 * shared cache, falling back to the find-related skill.
 */
export type FetchMatchesFn = (
  ticket: DeprecationTicketContext,
) => Promise<RawMatch[]>;

// Poll options for the find-related agent call. Default is the helper's own
// timing; tests inject fast/no-wait polling so they never sleep on real timers.
let agentPollOptions: RunAgentTaskOptions = {};

/** Test-only: speed up (or stub) the agent polling for the default source. */
export function _setAgentPollOptions(opts: RunAgentTaskOptions): void {
  agentPollOptions = opts;
}

/** Test-only: restore default agent polling. */
export function _resetAgentPollOptions(): void {
  agentPollOptions = {};
}

/** Run the find-related skill, parse, and persist into the shared cache. */
async function runFindRelated(jiraKey: string): Promise<RelatedStoryItem[]> {
  const result = await runAgentTaskToCompletion(
    {
      skill: "find-related",
      // find-related takes the ticket key in `args.args`, matching the route.
      args: { args: jiraKey },
      conversationId: `superseded-${jiraKey}-${Date.now()}`,
    },
    agentPollOptions,
  );
  if (!result.ok) {
    logger.warn("superseded-topic", "find-related unavailable", {
      jiraKey,
      reason: result.reason,
    });
    return [];
  }

  const items = parseRelatedStories(result.output)
    .filter((item) => item.key !== jiraKey)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);

  // Persist into the SAME cache the route writes (clear-then-insert) so the UI
  // and future re-scans reuse this result instead of re-running the agent.
  await db.delete(relatedSuggestionCache).where(eq(relatedSuggestionCache.ticketKey, jiraKey));
  if (items.length > 0) {
    const now = new Date().toISOString();
    await db.insert(relatedSuggestionCache).values(
      items.map((item) => ({
        id: randomUUID(),
        ticketKey: jiraKey,
        suggestedKey: item.key,
        score: item.score,
        title: item.title,
        issueType: item.type ?? null,
        status: item.status,
        jiraUrl: item.url ?? null,
        reason: item.reason ?? null,
        suggestedRelation: "relates to" as const,
        createdAt: now,
      })),
    );
  }

  return items;
}

/** Default: prefer a fresh shared-cache entry, otherwise run find-related. */
async function fetchMatchesDefault(t: DeprecationTicketContext): Promise<RawMatch[]> {
  const cached = await db
    .select()
    .from(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, t.jiraKey))
    .all();

  if (cached.length > 0) {
    const age = Date.now() - new Date(cached[0].createdAt).getTime();
    if (age < CACHE_TTL_MS) {
      return cached.map((row) => ({
        key: row.suggestedKey,
        score: row.score,
        title: row.title,
        status: row.status,
        reason: row.reason,
      }));
    }
  }

  const items = await runFindRelated(t.jiraKey);
  return items.map((item) => ({
    key: item.key,
    score: item.score,
    title: item.title,
    status: item.status,
    reason: item.reason ?? null,
  }));
}

let activeFetchMatches: FetchMatchesFn = fetchMatchesDefault;

/** Test-only: swap the match source (e.g. a mock). */
export function _setFetchMatchesFn(fn: FetchMatchesFn): void {
  activeFetchMatches = fn;
}

/** Test-only: restore the cache/agent-backed source. */
export function _resetFetchMatchesFn(): void {
  activeFetchMatches = fetchMatchesDefault;
}

/**
 * Enrich matches with each match ticket's own recency from the local DB. The
 * find-related cache stores the match status but not its jiraUpdatedAt, and the
 * "newer" half of the survivor rule needs it. Matches not present locally keep a
 * null timestamp and fall back to status-only.
 */
async function enrichRecency(matches: RawMatch[]): Promise<SupersededMatch[]> {
  if (matches.length === 0) return [];
  const keys = matches.map((m) => m.key);
  const rows = await db
    .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
    .from(ticket)
    .where(inArray(ticket.jiraKey, keys))
    .all();
  const updatedByKey = new Map(rows.map((r) => [r.jiraKey, r.jiraUpdatedAt]));
  return matches.map((m) => ({
    ...m,
    jiraUpdatedAt: updatedByKey.get(m.key) ?? null,
  }));
}

export const SUPERSEDED_TOPIC: DeprecationTopicScorer = {
  key: "duplicate",
  label: "Duplicate",
  weight: 1,
  // No special cap: a strong overlap with a newer/active survivor is an
  // objective, corroborated signal that may legitimately reach candidate.
  async run(ticket: DeprecationTicketContext): Promise<TopicScoreResult | null> {
    const raw = await activeFetchMatches(ticket);
    if (raw.length === 0) return null;

    const matches = await enrichRecency(raw);
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: ticket.jiraUpdatedAt,
      ticketStatus: ticket.status,
      matches,
    });

    // No high-overlap survivor => this ticket is not the obsolete one. Abstain
    // so the topic does not dilute the weighted average for unrelated tickets.
    if (!verdict) return null;

    return {
      score: verdict.score,
      evidence: verdict.evidence,
      rationale: verdict.rationale,
    };
  },
};

registerTopicScorer(SUPERSEDED_TOPIC);
