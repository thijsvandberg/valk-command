# BRDG-084: Search — Improvements (Highlights, History, No-Results State)

**Status:** Completed
**Priority:** Low
**Follows from:** BRDG-053 Phase 3

## Description

As the PO, I want the search modal to highlight matched terms in results, remember my recent searches, and show a helpful no-results state so search feels polished and efficient.

## Implementation Plan

1. **Checkbox 1 — Add `acceptanceCriteria` to Fuse index**
   - `src/lib/search-index-cache.ts`: Add `acceptanceCriteria: string` to `SearchDoc` interface; add `{ name: "acceptanceCriteria", weight: 0.4 }` to `FUSE_OPTIONS.keys`
   - `src/app/api/search/local/route.ts`: Populate `acceptanceCriteria: stripAdf(t.acceptanceCriteria)` in the `docs` mapping in `buildIndex()`
   - `src/app/api/search/local/route.ts`: Add `acceptanceCriteria: string | null` to `LocalSearchResult` interface and populate it in the result mapping
   - `src/app/api/search/local/route.test.ts`: Add test for AC-field matching

2. **Checkbox 2 — Highlight match location in result rows**
   - `src/components/sprint-board/SearchResultParts.tsx`: Add `MatchSnippet` component that extracts a ~120-char window around the first Fuse match in non-summary fields (description, acceptanceCriteria, localEditDescription, notes) and renders it with inline highlights
   - `src/components/sprint-board/SearchResultParts.tsx`: Update `LocalResultRow` to conditionally render `MatchSnippet` when the match occurred in a body field
   - `src/components/sprint-board/SearchModal.test.tsx`: Add test verifying snippet appears when description matches

3. **Checkbox 3 — Search history**
   - `src/hooks/useSearchHistory.ts`: New hook using `useLocalStorage("search_history", [])`. Exports `history`, `addSearch(q)` (dedup, prepend, cap at 5, min length 2), `clearHistory()`
   - `src/components/sprint-board/SearchModal.tsx`: Import hook; call `addSearch` when a result is selected; render history list when `query.length < 2 && history.length > 0` (with "Recent searches" header and "Clear" button); clicking an item sets query
   - `src/hooks/useSearchHistory.test.ts`: Tests for dedup, capping, min length, clear

4. **Checkbox 4 — No-results state with Jira CTA**
   - `src/components/sprint-board/SearchResultParts.tsx`: Add `onSwitchToJira?: () => void` prop to `EmptyState`; replace the passive hint with an actionable button "Search in Jira mode" that calls `onSwitchToJira`
   - `src/components/sprint-board/SearchModal.tsx`: Pass `onSwitchToJira` callback to `EmptyState` that sets mode to "jira", copies query to jiraQuery, and calls `runJiraSearch`

**Order:** 1 → 2 (depends on 1 for AC field), 3 and 4 can be done in parallel with 1/2.

## Acceptance Criteria

- [x] Search across ticket description and AC content (not just title/summary)
- [x] Highlight search term in result rows where it matched
- [x] Search history: last 5 searches shown when the input is empty
- [x] "No results" state with suggestion to try Jira search

## Technical Notes

- Fuse.js already returns `matches` with index ranges — use these to render highlighted spans in result rows
- Search history stored in localStorage (no API needed), key: `search_history`
- Extending search to description/AC requires ensuring those fields are in the Fuse index (already partially done via `description` field in SearchDoc)
- "No results" state already has a placeholder component (`EmptyState`); enhance it with a Jira search CTA

## Notes

- Phase 1 limitation: search still requires ≥2 chars even when filters are active. If browse-without-query is desired, scope it to this story.
