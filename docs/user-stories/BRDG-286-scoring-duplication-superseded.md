# BRDG-286: Scoring Topic — Duplication / Superseded

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Scores how likely a ticket is obsolete because it **strongly overlaps a newer or active ticket** — a
duplicate or superseded story. Reuses Bridge's existing `find-related` skill and parsing rather than
building new search infrastructure.

## Requirements

- For a ticket in the Tier-2 deep dive, invoke the existing `find-related` flow
  (`/api/tickets/[key]/related-suggestions` + `parse-related-stories.ts`) and inspect the top matches.
- Raise the score when a high-overlap match is a **newer or active** ticket (the candidate is the
  likely-obsolete one, not the survivor). Bias against flagging the newer ticket.
- Write `scanScores.superseded` + evidence (`supersededBy: "BT-XXX"`, overlap score, match reason) and
  add "Likely superseded by BT-XXX" to `scanRationale`; contribute to `scanOverall`.
- Surface the superseded-by link on the review screen (BRDG-289) so the PO can open the survivor.
- Reuse the existing `relatedSuggestionCache` TTL; do not duplicate caching.

## Testing

- Parsing `find-related` output into a superseded verdict (mock the agent/cache).
- Newer/active match raises score; older/duplicate-of-this-being-newer does not flag this ticket.
- Evidence + rationale written correctly.

## Implementation Plan

Plug a new Tier-2 scorer into the topic-scorer registry (BRDG-284) and reuse the existing
`find-related` feature end-to-end — no new search or caching.

- **Topic key:** `duplicate` (already in `SCAN_TOPICS`; flipped `live: true`). Label "Duplicate".
- **Scorer:** `src/lib/topics/superseded-topic.ts`, weight 1, no special cap (a corroborated
  strong-overlap survivor is objective). Registered via the side-effect barrel `src/lib/topics/index.ts`.
- **Match source:** prefer a fresh `relatedSuggestionCache` row (same 30-min TTL the
  `/api/tickets/[key]/related-suggestions` route uses); on a cold/stale cache, run the `find-related`
  skill via `runAgentTaskToCompletion`, parse with `parseRelatedStories`, and persist into the SAME
  cache (clear-then-insert, mirroring the route's PUT). Injectable for tests.
- **Verdict rule (pure, `superseded-verdict.ts`):** a match is a *survivor* (so THIS ticket is the
  obsolete one) when overlap >= 70/100 AND the match is **newer** (its `jiraUpdatedAt` from the local
  ticket table is later than this ticket's) **or active** (status is in-flight: not backlog-like and
  not done/closed). Pick the strongest-overlap survivor; lift the score when newer + active corroborate.
  **Abstain** (return null) when no high-overlap survivor exists — biasing against flagging the newer/
  active survivor itself.
- **Evidence:** `{ supersededBy, overlapScore, matchReason, matchStatus, survivorBasis }`;
  rationale line `"Likely superseded by BT-XXX"`. The `supersededBy` key lets BRDG-289 render a link.

## Checklist

- [x] Invoke `find-related` for deep-dive tickets and read top matches
- [x] Score up on high overlap with a newer/active ticket; bias against flagging the survivor
- [x] Write `scanScores.duplicate` + `supersededBy` evidence; add rationale line <!-- key is `duplicate` per SCAN_TOPICS, not `superseded`; reused the existing key as instructed -->
- [x] Reuse `relatedSuggestionCache`; no new search/caching infra
- [x] Surface the superseded-by link for the review screen <!-- evidence carries supersededBy key; BRDG-289 renders the link -->
- [x] Tests (parse, scoring direction, evidence)
- [x] Run `npm run lint`, `npm run typecheck` <!-- skipped: `npm run test` (full suite) and `npm run build` per task instructions; ran only new test files -->
- [x] Update docs and reference the epic
