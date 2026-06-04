/**
 * Tier-2 deep-dive topic-scorer registry + runner for the Backlog Deprecation
 * Review epic (see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * THIS IS THE EXTENSION POINT for BRDG-285..288. Each scoring-topic story ships
 * a `DeprecationTopicScorer` and calls `registerTopicScorer(scorer)` at module
 * load. It does NOT touch the queue, the runner, or `runDeepScan`: the
 * orchestration here calls every registered scorer and merges its result. The
 * topics arrive independently and compose automatically.
 *
 * Contract a topic story must follow:
 *   1. Export a `DeprecationTopicScorer` with a stable `key` (matching a key in
 *      SCAN_TOPICS in cleanup-types.ts so the /cleanup column lights up).
 *   2. Its `run(ticket, ctx)` returns `{ score, evidence?, rationale? }` in 0..1,
 *      or `null` to abstain (no opinion -> the topic does not contribute).
 *   3. Optionally set `weight` (relative importance) and `maxContribution` (a
 *      hard cap on how much this topic can add to scanOverall). A subjective
 *      topic (e.g. relevance decay, BRDG-288) sets a low cap so that it alone
 *      can never push a ticket to high confidence.
 *   4. Call `registerTopicScorer(scorer)` once at import time.
 */

import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ScanTopicKey } from "@/lib/cleanup-types";
import { REVIVAL_CANDIDATE_THRESHOLD } from "@/lib/cleanup-types";
import type { AnalyzerResult } from "@/lib/deprecation-analyzer";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** Minimal ticket view passed to a scorer. Topics that need more read the DB. */
export interface DeprecationTicketContext {
  jiraKey: string;
  title: string;
  status: string;
  description: string | null;
  jiraUpdatedAt: string | null;
  sprintName: string | null;
  labels: string | null;
  components: string | null;
}

/** Side channels a scorer may use (agent client, etc.). Kept open for later. */
export interface DeprecationScanContext {
  /** Injectable clock for deterministic tests. */
  now: number;
}

export interface TopicScoreResult {
  /** 0..1 likelihood this topic contributes to deprecation. */
  score: number;
  /** Topic-specific structured proof (e.g. supersededBy, matched keywords). */
  evidence?: unknown;
  /** Human-readable line assembled into the overall rationale. */
  rationale?: string;
}

export interface DeprecationTopicScorer {
  /** Stable key; must match a SCAN_TOPICS key so the UI column lights up. */
  key: ScanTopicKey;
  /** Display label (informational; the column label comes from SCAN_TOPICS). */
  label: string;
  /**
   * Relative importance in the weighted combination. Defaults to 1. The cap
   * (maxContribution) defaults to this weight, so by default a topic can
   * contribute up to its full weight.
   */
  weight?: number;
  /**
   * Hard cap on this topic's contribution to scanOverall, expressed on the same
   * scale as `weight`. Lower than `weight` means "this topic can nudge the
   * score but never dominate it" — the hook subjective topics use.
   */
  maxContribution?: number;
  /** Returns a score, or null to abstain (topic has no opinion on this ticket). */
  run(
    ticket: DeprecationTicketContext,
    ctx: DeprecationScanContext,
  ): Promise<TopicScoreResult | null>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const scorers = new Map<string, DeprecationTopicScorer>();

/** Register (or replace) a topic scorer. Idempotent per key. */
export function registerTopicScorer(scorer: DeprecationTopicScorer): void {
  scorers.set(scorer.key, scorer);
}

/** All currently registered scorers, in registration order. */
export function getTopicScorers(): DeprecationTopicScorer[] {
  return [...scorers.values()];
}

/** Test-only: clear the registry. Exported so tests start from a clean slate. */
export function _clearTopicScorers(): void {
  scorers.clear();
}

// ---------------------------------------------------------------------------
// Overall combination
// ---------------------------------------------------------------------------

// Score at/above which a deep-scanned ticket is surfaced as a candidate.
// Mirrors the Tier-1 threshold so the two tiers read consistently.
export const DEEP_SCAN_CANDIDATE_THRESHOLD = 0.6;

// REVIVAL_CANDIDATE_THRESHOLD is defined in the client-safe cleanup-types
// module and re-exported here for the server-side scoring code and existing
// tests, so the /cleanup client view can import it without pulling this
// server-only module (db, agent) into the client bundle.
export { REVIVAL_CANDIDATE_THRESHOLD } from "@/lib/cleanup-types";

interface TopicContribution {
  key: string;
  score: number;
  weight: number;
  cap: number;
}

/**
 * Combine per-topic scores into a single 0..1 deprecation-likelihood.
 *
 * Weighted average where each topic's contribution to the numerator is capped
 * at its `maxContribution`. WHY cap-then-normalize rather than a plain max or
 * sum: a plain sum lets several weak signals stack to a false-high; a plain max
 * ignores corroboration. A capped weighted average rewards agreement across
 * topics while letting a single subjective topic (low cap) never alone cross
 * the candidate threshold. The denominator is the sum of weights of topics that
 * actually scored, so abstaining topics neither help nor hurt.
 */
export function combineTopicScores(contributions: TopicContribution[]): number {
  if (contributions.length === 0) return 0;
  let numerator = 0;
  let denominator = 0;
  for (const c of contributions) {
    const clamped = Math.min(1, Math.max(0, c.score));
    // Effective contribution is the score scaled by weight, capped. The cap is
    // on the weighted scale, so a cap below the weight throttles the topic.
    const weighted = clamped * c.weight;
    numerator += Math.min(weighted, c.cap);
    denominator += c.weight;
  }
  if (denominator === 0) return 0;
  return Math.min(1, Math.max(0, numerator / denominator));
}

// ---------------------------------------------------------------------------
// Consolidated analyzer wiring (BRDG-298)
// ---------------------------------------------------------------------------

/**
 * Consolidated-analysis function: runs the single VRW `analyze-deprecation`
 * skill and returns mapped topic scores + a revival verdict, or null when the
 * agent is unavailable / its response is unparseable.
 *
 * WHY injectable + lazily wired: runDeepScan PREFERS this single call and only
 * falls back to the registered per-topic scorers when it returns null. The real
 * implementation lives in deprecation-analyzer.ts; it is injected here (rather
 * than imported at module top) to keep this registry module free of the agent
 * client and to let tests swap a mock without the network. Default is null until
 * `setConsolidatedAnalyzer` is called (the deep-scan side-effect barrel wires it,
 * the same place that imports the per-topic scorers).
 */
export type ConsolidatedAnalyzerFn = (
  ticket: DeprecationTicketContext,
  ctx: DeprecationScanContext,
) => Promise<AnalyzerResult | null>;

let consolidatedAnalyzer: ConsolidatedAnalyzerFn | null = null;

/** Wire (or replace) the consolidated analyzer used as the primary deep-scan path. */
export function setConsolidatedAnalyzer(fn: ConsolidatedAnalyzerFn | null): void {
  consolidatedAnalyzer = fn;
}

// ---------------------------------------------------------------------------
// runDeepScan
// ---------------------------------------------------------------------------

export interface DeepScanResult {
  jiraKey: string;
  /** False when the ticket no longer exists / is not eligible. */
  scanned: boolean;
  scanOverall: number;
  /** True when scanOverall crossed the candidate threshold this run. */
  becameCandidate: boolean;
  /** Keys of topics that returned a score this run. */
  topicsRun: string[];
  /** Revival likelihood 0..1 (BRDG-298); 0 when no analyzer ran. */
  revivalScore: number;
  /** True when revivalScore crossed the revival threshold this run. */
  becameRevivalCandidate: boolean;
  reason?: string;
}

/**
 * Run every registered topic scorer against one ticket, merge the results into
 * its persisted scanScores, recompute scanOverall, set disposition=candidate on
 * threshold, and stamp lastDeepScannedAt.
 *
 * Pre-existing topic scores (e.g. Tier-1 staleness) are preserved and folded
 * into the combination so the deep dive augments rather than replaces Tier-1.
 * Confirmed/dismissed dispositions are never downgraded here — only an unset or
 * already-candidate disposition is promoted to candidate.
 */
export async function runDeepScan(
  jiraKey: string,
  ctx: DeprecationScanContext = { now: Date.now() },
): Promise<DeepScanResult> {
  const row = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      status: ticket.status,
      description: ticket.description,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
      sprintName: ticket.sprintName,
      labels: ticket.labels,
      components: ticket.components,
      removedFromJiraAt: ticket.removedFromJiraAt,
      scanScores: ticketMetadata.scanScores,
      disposition: ticketMetadata.disposition,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(eq(ticket.jiraKey, jiraKey))
    .get();

  if (!row || row.removedFromJiraAt) {
    return {
      jiraKey,
      scanned: false,
      scanOverall: 0,
      becameCandidate: false,
      topicsRun: [],
      revivalScore: 0,
      becameRevivalCandidate: false,
      reason: row ? "removed from Jira" : "ticket not found",
    };
  }

  const ticketCtx: DeprecationTicketContext = {
    jiraKey: row.jiraKey,
    title: row.title,
    status: row.status,
    description: row.description,
    jiraUpdatedAt: row.jiraUpdatedAt,
    sprintName: row.sprintName,
    labels: row.labels,
    components: row.components,
  };

  // Existing scores survive: deep dive merges into, never wipes, the map.
  const scores: Record<string, { score: number; evidence?: unknown; rationale?: string }> = {};
  if (row.scanScores) {
    try {
      const parsed = JSON.parse(row.scanScores);
      if (parsed && typeof parsed === "object") Object.assign(scores, parsed);
    } catch {
      // Corrupt JSON is discarded; the scan rebuilds what it can.
    }
  }

  const topicsRun: string[] = [];
  const rationaleLines: string[] = [];

  // Revival verdict (BRDG-298) only the consolidated analyzer produces. Defaults
  // to "no signal" so the per-topic fallback simply leaves revival untouched.
  let revivalScore = 0;
  let revivalRationale: string | null = null;
  let revivalRelatedKeys: string[] = [];

  // PRIMARY PATH: one consolidated `analyze-deprecation` call covers every topic
  // plus revival. Used whenever the analyzer is wired and returns a result.
  let usedConsolidated = false;
  if (consolidatedAnalyzer) {
    let analysis: AnalyzerResult | null = null;
    try {
      analysis = await consolidatedAnalyzer(ticketCtx, ctx);
    } catch {
      // A failing analyzer must not sink the scan; fall through to per-topic.
      analysis = null;
    }
    if (analysis) {
      usedConsolidated = true;
      for (const [key, entry] of Object.entries(analysis.topicScores)) {
        if (!entry) continue;
        topicsRun.push(key);
        scores[key] = {
          score: entry.score,
          evidence: entry.evidence,
          rationale: entry.rationale,
        };
        if (entry.rationale) rationaleLines.push(entry.rationale);
      }
      revivalScore = analysis.revival.score;
      revivalRationale = analysis.revival.rationale || null;
      revivalRelatedKeys = analysis.revival.relatedKeys;
    }
  }

  // FALLBACK PATH: the analyzer was unavailable or returned nothing parseable.
  // Run the registered per-topic scorers exactly as before so the deep scan still
  // produces topic scores. (Revival has no fallback: it is an analyzer-only idea.)
  if (!usedConsolidated) {
    for (const scorer of getTopicScorers()) {
      let result: TopicScoreResult | null = null;
      try {
        result = await scorer.run(ticketCtx, ctx);
      } catch {
        // A failing topic must not sink the whole deep scan; it simply abstains.
        result = null;
      }
      if (!result) continue;
      topicsRun.push(scorer.key);
      scores[scorer.key] = {
        score: result.score,
        evidence: result.evidence,
        rationale: result.rationale,
      };
      if (result.rationale) rationaleLines.push(result.rationale);
    }
  }

  // Build the combination from EVERY topic present in the merged map (Tier-1
  // staleness included), honoring each registered scorer's weight/cap.
  const scorerByKey = new Map(getTopicScorers().map((s) => [s.key, s]));
  const contributions: TopicContribution[] = [];
  for (const [key, entry] of Object.entries(scores)) {
    if (!entry || typeof entry.score !== "number") continue;
    const scorer = scorerByKey.get(key as ScanTopicKey);
    const weight = scorer?.weight ?? 1;
    const cap = scorer?.maxContribution ?? weight;
    contributions.push({ key, score: entry.score, weight, cap });
  }

  const scanOverall = combineTopicScores(contributions);
  const scannedAt = new Date(ctx.now).toISOString();

  // RECONCILE direction (BRDG-298): deprecation and revival are opposite reads.
  // A ticket the analyzer judges worth pulling up should not also read as a
  // strong deprecation candidate. When revival wins (>= threshold and >= the
  // deprecation score), suppress the deprecation candidate promotion so the two
  // signals stay mutually sensible. The analyzer itself is instructed to keep the
  // weaker direction low, so this is a safety net rather than the primary guard.
  const crossedRevival = revivalScore >= REVIVAL_CANDIDATE_THRESHOLD;
  const revivalWins = crossedRevival && revivalScore >= scanOverall;

  // Store revival related keys alongside topic scores so the /cleanup row and the
  // review screen can read them without a separate column. WHY in scanScores:
  // keeps the loose JSON the epic already uses for evidence; the dedicated
  // columns carry the score + rationale for cheap sorting/filtering.
  if (crossedRevival || revivalRelatedKeys.length > 0 || revivalRationale) {
    scores.revival = {
      score: revivalScore,
      rationale: revivalRationale ?? undefined,
      evidence: { relatedKeys: revivalRelatedKeys },
    };
  }

  // Assemble a rationale from the topic lines plus any pre-existing staleness
  // rationale, falling back to a neutral note when nothing fired.
  const existingStaleness = scores.staleness?.rationale;
  if (existingStaleness && !rationaleLines.includes(existingStaleness)) {
    rationaleLines.unshift(existingStaleness);
  }
  const rationale = rationaleLines.length > 0
    ? rationaleLines.join("; ")
    : "Deep scan found no deprecation signals";

  // Promote to candidate on threshold, but never downgrade a human disposition
  // (confirmed/dismissed). An unset or already-candidate row may be (re)set.
  // Revival winning suppresses the auto-promotion (see reconcile note above).
  const current = row.disposition ?? null;
  const crossed = scanOverall >= DEEP_SCAN_CANDIDATE_THRESHOLD && !revivalWins;
  let nextDisposition = current;
  if (crossed && (current === null || current === "candidate")) {
    nextDisposition = "candidate";
  }
  const becameCandidate = crossed && current !== "candidate" && nextDisposition === "candidate";

  const becameRevivalCandidate = crossedRevival;

  const fields = {
    scanScores: JSON.stringify(scores),
    scanOverall,
    scanRationale: rationale,
    lastDeepScannedAt: scannedAt,
    disposition: nextDisposition,
    revivalScore: revivalScore > 0 ? revivalScore : null,
    revivalRationale: revivalRationale,
  };

  await db
    .insert(ticketMetadata)
    .values({ jiraKey, ...fields })
    .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: fields });

  return {
    jiraKey,
    scanned: true,
    scanOverall,
    becameCandidate,
    topicsRun,
    revivalScore,
    becameRevivalCandidate,
  };
}

// ---------------------------------------------------------------------------
// Example / stub scorer (BRDG-284)
// ---------------------------------------------------------------------------

/**
 * EXAMPLE STUB ONLY — not a real topic, and SUPERSEDED by the production
 * `replaced` scorer in src/lib/topics/replaced-area-topic.ts (BRDG-285), which
 * registers under this same key with an editable keyword list + AI confirmation.
 * This stub is kept solely as a minimal copy-paste reference for the contract
 * above. It is deliberately NOT registered by default; tests register it
 * explicitly. Do not register it in production — it would overwrite the real one.
 *
 * Heuristic: a long-untouched ticket whose title/labels mention a known retired
 * area scores high. Cheap, deterministic, no AI.
 */
export const EXAMPLE_RETIRED_AREA_SCORER: DeprecationTopicScorer = {
  key: "replaced",
  label: "Replaced area (example stub)",
  weight: 1,
  async run(t) {
    const retired = ["cwi", "rezexchange", "idpms", "hybrid cloud"];
    const haystack = `${t.title} ${t.labels ?? ""} ${t.components ?? ""}`.toLowerCase();
    const matched = retired.filter((kw) => haystack.includes(kw));
    if (matched.length === 0) return null;
    return {
      score: 0.9,
      evidence: { matchedKeywords: matched },
      rationale: `Mentions retired area(s): ${matched.join(", ")}`,
    };
  },
};
