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

## Checklist

- [ ] Gate on a "suspicious" combined-score threshold from cheaper topics
- [ ] Invoke codebase-research; capture implemented-in evidence
- [ ] Hard daily throttle with transparent coverage logging (no silent caps)
- [ ] Write `scanScores.alreadyBuilt`; add rationale line; contribute to overall
- [ ] Tests (gate, throttle, parse)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
