# BRDG-083: Search — Grouped Results

**Status:** Open
**Priority:** Low
**Follows from:** BRDG-053 Phase 2

## Description

As the PO, I want search results in the local search modal to be grouped by category (Tickets, Conversations, Comments) so I can quickly distinguish result types in a growing dataset.

## Acceptance Criteria

- [ ] Results grouped by category: Tickets, Conversations, Comments
- [ ] Section headers with result count per category
- [ ] Collapse/expand sections
- [ ] Show max 5 results per category initially, "Show more" to expand

## Technical Notes

- Requires extending `/api/search/local` to search across conversations and comments in addition to tickets
- Full-text search on description/comments may benefit from SQLite FTS5 (evaluate performance vs LIKE queries)
- GroupBy logic lives in the API response; the component renders sections

## Out of Scope
- Ranking/relevance across categories
- Search within attachments
