# BRDG-085: Search — Saved Searches

**Status:** Open
**Priority:** Low
**Follows from:** BRDG-053 Phase 4

## Description

As the PO, I want to save frequently used search queries (with their filters) so I can quickly re-run searches without re-entering parameters each time.

## Acceptance Criteria

- [ ] "Save this search" action that stores query + active filters
- [ ] Saved searches accessible from search modal (e.g. sidebar or dropdown when input is empty)
- [ ] Max 10 saved searches
- [ ] Delete saved search

## Technical Notes

- Saved searches stored in `appSetting` table as JSON under key `saved_searches`
- Shape: `{ id: string, label: string, query: string, filters: SearchFilters }[]`
- No dedicated API route needed; use the existing `/api/settings` or a small dedicated endpoint
- Depends on `SearchFilters` type introduced in BRDG-053
