# BRDG-288: Scoring Topic — Relevance Decay

**Status:** Done
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Scores how likely a ticket is obsolete because it **no longer fits the current product direction** —
the work may once have made sense but is no longer valuable. This is the most subjective topic: an AI
judgement against current product context, so its rationale must be explicit and it should never be the
sole reason a ticket is flagged with high confidence.

## Requirements

- For a deep-dive ticket, ask the agent to judge relevance against current product context (the PRD /
  product spec referenced in `CLAUDE.md`, recent direction) and return a relevance-decay score + a
  one-line rationale ("Targets a flow the product no longer offers").
- Write `scanScores.relevance` + rationale; contribute to `scanOverall` with a **capped weight**
  so a subjective signal alone can't push a ticket to "high confidence" — it needs corroboration from a
  harder topic.
- Clearly label this topic's score in the UI as a judgement call (lower trust than staleness/keywords).

## Implementation Plan

1. Create `src/lib/topics/relevance-decay-topic.ts` with `RELEVANCE_DECAY_TOPIC` scorer registered
   under the existing `"relevance"` key. Use `weight=1, maxContribution=0.3` to cap solo contribution.
2. Add the `investigate` skill call via `runAgentTaskToCompletion`. The prompt reads the PRD and
   epic docs and requests a three-line structured response (RELEVANCE / SCORE / RATIONALE).
3. Parse the response with `parseRelevanceDecayResult`; abstain on failure, near-zero score, or
   unparseable output — never throw or falsely score.
4. Register in `src/lib/topics/index.ts` barrel.
5. Set `live: true` for the `"relevance"` topic in `src/lib/cleanup-types.ts`.
6. Add a muted italic `~` marker to the Relevance decay column header in the cleanup page table to
   signal "AI judgement call / approximate", with a tooltip explaining the lower trust.
7. Co-located tests covering parse, cap math, score/abstain paths, graceful degradation.

## Checklist

- [x] Agent judges relevance vs current product context; returns score + rationale
- [x] Write `scanScores.relevance`; capped contribution to overall (needs corroboration)
- [x] UI labels this score as a judgement call
- [x] Tests (parse, weight cap)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` <!-- skipped: npm run build and npm run test (full suite) per story instructions; ran lint + typecheck (clean) + vitest run on the new test file (27/27 passed) -->
- [x] Update docs and reference the epic
