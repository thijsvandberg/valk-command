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
