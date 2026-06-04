/**
 * Registration barrel for Tier-2 deep-scan topic scorers (Backlog Deprecation
 * Review epic, see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * Importing this module once (the deep-scan runner does) executes each topic
 * module's `registerTopicScorer(...)` side-effect, so every shipped topic is in
 * the registry before `runDeepScan` runs. Later topics (BRDG-286..288) add their
 * import here and compose automatically.
 */
import "@/lib/topics/replaced-area-topic";
import "@/lib/topics/superseded-topic";
import "@/lib/topics/already-built-topic";
import "@/lib/topics/relevance-decay-topic";

// Wire the consolidated analyzer (BRDG-298) as runDeepScan's PRIMARY path. The
// per-topic scorers imported above remain registered as the FALLBACK used when
// the analyzer is unavailable or returns nothing parseable. Wired here, the same
// side-effect barrel the deep-scan runner imports, so both paths are ready
// before runDeepScan runs.
import { setConsolidatedAnalyzer } from "@/lib/deprecation-topics";
import { runConsolidatedAnalysis } from "@/lib/deprecation-analyzer";

setConsolidatedAnalyzer((ticket, ctx) =>
  runConsolidatedAnalysis(ticket, { now: ctx.now }),
);
