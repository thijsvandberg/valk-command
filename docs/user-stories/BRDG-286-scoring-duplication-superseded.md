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

## Checklist

- [ ] Invoke `find-related` for deep-dive tickets and read top matches
- [ ] Score up on high overlap with a newer/active ticket; bias against flagging the survivor
- [ ] Write `scanScores.superseded` + `supersededBy` evidence; add rationale line
- [ ] Reuse `relatedSuggestionCache`; no new search/caching infra
- [ ] Surface the superseded-by link for the review screen
- [ ] Tests (parse, scoring direction, evidence)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
