# BRDG-288: Scoring Topic — Relevance Decay

**Status:** Planned
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
- Write `scanScores.relevanceDecay` + rationale; contribute to `scanOverall` with a **capped weight**
  so a subjective signal alone can't push a ticket to "high confidence" — it needs corroboration from a
  harder topic.
- Clearly label this topic's score in the UI as a judgement call (lower trust than staleness/keywords).

## Testing

- Result parsed into score + rationale (mock the agent).
- Weight cap: relevance-decay alone cannot produce a high overall score without another topic.

## Checklist

- [ ] Agent judges relevance vs current product context; returns score + rationale
- [ ] Write `scanScores.relevanceDecay`; capped contribution to overall (needs corroboration)
- [ ] UI labels this score as a judgement call
- [ ] Tests (parse, weight cap)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
