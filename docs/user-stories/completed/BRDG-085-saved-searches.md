# BRDG-085: Search — Saved Searches

**Status:** Done
**Priority:** Low
**Follows from:** BRDG-053 Phase 4

## Description

As the PO, I want to save frequently used search queries (with their filters) so I can quickly re-run searches without re-entering parameters each time.

## Implementation Plan

1. **Add serialization helpers to `SearchFilterPanel.tsx`** — export `SerializedSearchFilters` interface, `serializeFilters()`, and `deserializeFilters()` to handle Set/array conversion at the storage boundary.
2. **Create `/api/settings/saved-searches/route.ts`** — GET + PUT following the quick-prompts pattern; zod validation; max 10 entries enforced in the schema.
3. **Create `/api/settings/saved-searches/route.test.ts`** — mirror quick-prompts test structure; test GET empty/stored, PUT valid/invalid/upsert/overflow.
4. **Create `useSavedSearches` hook** (`src/hooks/useSavedSearches.ts`) — SWR-backed; exports `savedSearches`, `saveSearch(label, query, filters)`, `deleteSearch(id)`; handles serialize/deserialize at the boundary.
5. **Create `useSavedSearches.test.ts`** — cover fetch, save, delete, serialization round-trip.
6. **Integrate into `SearchModal.tsx`**:
   - Import hook + new icons (`Bookmark`, `BookmarkCheck`, `Trash2`)
   - Show "Saved searches" section above history when query is empty
   - Add "Save this search" button in the footer (local mode, query >= 2 chars)
   - Apply saved search on click (sets query + filters)
   - Delete saved search on trash icon click

## Acceptance Criteria

- [x] "Save this search" action that stores query + active filters
- [x] Saved searches accessible from search modal (e.g. sidebar or dropdown when input is empty)
- [x] Max 10 saved searches
- [x] Delete saved search

## Technical Notes

- Saved searches stored in `appSetting` table as JSON under key `saved_searches`
- Shape: `{ id: string, label: string, query: string, filters: SearchFilters }[]`
- No dedicated API route needed; use the existing `/api/settings` or a small dedicated endpoint
- Depends on `SearchFilters` type introduced in BRDG-053
