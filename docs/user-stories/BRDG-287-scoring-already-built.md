# BRDG-287: Scoring Topic — Already Built

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Scores how likely a ticket is obsolete because the feature it describes **already exists** — shipped in
the product or delivered under a Done ticket. This is the most expensive topic (it asks the agent to
search the actual product codebase), so it is **selective and hard-throttled**: only run for tickets
that already look suspicious from the cheaper topics.

## Requirements

- Gate: only invoke for deep-dive tickets whose combined score from the cheaper topics
  (staleness + replaced-area + superseded) already crosses a "suspicious" threshold.
- Invoke the agent's codebase-research capability to check whether the described feature is already
  implemented (or covered by a Done ticket); capture evidence (file/area or ticket reference).
- **Hard throttle**: a small max number of these checks per day; log what was and wasn't checked so
  coverage is transparent (no silent caps).
- Write `scanScores.alreadyBuilt` + evidence and add "Appears already implemented" to `scanRationale`;
  contribute to `scanOverall`.

## Testing

- Gate: only suspicious tickets trigger the codebase call.
- Throttle: stops at the daily cap and logs the remainder.
- Result parsed into score + evidence + rationale (mock the agent).

## Implementation Plan

1. **Mark `alreadyBuilt` as `live: true` in `cleanup-types.ts`** — the topic key already exists; flip the flag so the UI column lights up.

2. **Create `src/lib/topics/already-built-topic.ts`** — the scorer:
   - Define `ALREADY_BUILT_GATE_THRESHOLD = 0.4` (sum of `staleness + replaced + duplicate` from persisted `scanScores` read inside `run()`). If the combined cheaper-topic score is below this, return `null` (no agent call).
   - Define `ALREADY_BUILT_DAILY_CAP = 20` (constant).
   - Throttle: on each invocation, read `app_setting` key `already-built-scan:<YYYY-MM-DD>` (today's date UTC). Parse the integer. If >= cap, log a warning (logger.warn) with the skipped ticket key and return `null`. Otherwise increment and upsert.
   - Agent call: `runAgentTaskToCompletion` with `skill: "codebase-research"`, args containing a focused prompt asking whether the described feature is already implemented in the codebase or covered by a Done ticket. Parse the result into `score`, `evidence` (implementing file/area or Done-ticket reference), and `rationale: "Appears already implemented"`.
   - Injectable `RunAgentFn` + injectable `ReadSettingFn` / `WriteSettingFn` for test isolation.
   - Register: `registerTopicScorer(ALREADY_BUILT_TOPIC)`.

3. **Register in `src/lib/topics/index.ts`** — add `import "@/lib/topics/already-built-topic";`.

4. **Create `src/lib/topics/already-built-topic.test.ts`** — co-located tests:
   - Gate test: below-threshold ticket does NOT call agent (assert mock not called).
   - Throttle test: after cap calls succeed, next one abstains and logs.
   - Throttle reset test: different date key is fresh (count 0).
   - Parse test: success path produces score + evidence + rationale.
   - Degraded test: agent failure returns null without throwing.

5. **Update `docs/architecture/` relevant file** (Jira Sync or a new deprecation-topics doc) to reference the new topic and its gate/throttle.

6. **Run lint + typecheck + tests; commit.**

## Checklist

- [x] Gate on a "suspicious" combined-score threshold from cheaper topics
- [x] Invoke codebase-research; capture implemented-in evidence
- [x] Hard daily throttle with transparent coverage logging (no silent caps)
- [x] Write `scanScores.alreadyBuilt`; add rationale line; contribute to overall
- [x] Tests (gate, throttle, parse)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [x] Update docs and reference the epic
