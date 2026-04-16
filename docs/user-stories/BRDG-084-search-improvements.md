# BRDG-084: Search — Improvements (Highlights, History, No-Results State)

**Status:** Open
**Priority:** Low
**Follows from:** BRDG-053 Phase 3

## Description

As the PO, I want the search modal to highlight matched terms in results, remember my recent searches, and show a helpful no-results state so search feels polished and efficient.

## Acceptance Criteria

- [ ] Search across ticket description and AC content (not just title/summary)
- [ ] Highlight search term in result rows where it matched
- [ ] Search history: last 5 searches shown when the input is empty
- [ ] "No results" state with suggestion to try Jira search

## Technical Notes

- Fuse.js already returns `matches` with index ranges — use these to render highlighted spans in result rows
- Search history stored in localStorage (no API needed), key: `search_history`
- Extending search to description/AC requires ensuring those fields are in the Fuse index (already partially done via `description` field in SearchDoc)
- "No results" state already has a placeholder component (`EmptyState`); enhance it with a Jira search CTA

## Notes

- Phase 1 limitation: search still requires ≥2 chars even when filters are active. If browse-without-query is desired, scope it to this story.
