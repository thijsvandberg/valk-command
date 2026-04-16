# BRDG-083: Search — Grouped Results

**Status:** Done
**Priority:** Low
**Follows from:** BRDG-053 Phase 2

## Description

As the PO, I want search results in the local search modal to be grouped by category (Tickets, Conversations, Comments) so I can quickly distinguish result types in a growing dataset.

## Implementation Plan

1. **Define new result type interfaces** in `route.ts`: `ConversationSearchResult`, `CommentSearchResult`, `GroupedSearchResponse`. Keep flat `results` field for backward compat.
2. **Extend search-index-cache.ts**: add `ConversationSearchDoc`, `CommentSearchDoc`, second and third Fuse indexes, update `CacheEntry` and `setSearchCache`.
3. **Extend buildIndex in route.ts**: load `conversation` + `message` tables, build conversation docs (concatenate message bodies per conversation, truncated), build comment docs from already-loaded jiraComment/poComment rows.
4. **Search across all three indexes in the GET handler**: run conversation and comment Fuse searches alongside ticket search; filters only apply to tickets; return `{ groups: { tickets, conversations, comments }, results: tickets }`.
5. **Add `GroupedResultSection` + `ConversationResultRow` + `CommentResultRow` to `SearchResultParts.tsx`**: section header with collapse/expand chevron, count badge, "Show more" button (initial 5 visible); row components link to `/chat/{id}` and `/tickets/{ticketKey}` respectively.
6. **Update `SearchModal.tsx`**: replace flat `localResults` with `groupedResults` state; add per-section collapse and expand-all state; compute `visibleRows` flat array via `useMemo` for keyboard navigation; render three `GroupedResultSection` components; preview pane only for ticket results.
7. **Update API tests** (`route.test.ts`): add conversation/comment mock data, assert `groups.*` fields, verify filters don't affect conversations/comments.
8. **Update UI tests** (`SearchModal.test.tsx`): update mock responses to include `groups`; add tests for section headers, collapse/expand, show-more, grouped keyboard nav.

## Acceptance Criteria

- [x] Results grouped by category: Tickets, Conversations, Comments
- [x] Section headers with result count per category
- [x] Collapse/expand sections
- [x] Show max 5 results per category initially, "Show more" to expand

## Technical Notes

- Requires extending `/api/search/local` to search across conversations and comments in addition to tickets
- Full-text search on description/comments may benefit from SQLite FTS5 (evaluate performance vs LIKE queries)
- GroupBy logic lives in the API response; the component renders sections

## Out of Scope
- Ranking/relevance across categories
- Search within attachments
