# BRDG-053: Advanced Search with Filters

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the search modal to support filters (status, sprint, assignee, date range) and show results grouped by category so I can find things faster in a growing dataset.

## Acceptance Criteria

### Phase 1: Search filter bar
- [ ] Add filter chips below the search input in the search modal
- [ ] Filter options: Status (multi-select), Sprint (multi-select), Assignee (multi-select), Type (Story/Bug/Task/Spike)
- [ ] Date range filter: "Last 7 days", "Last 30 days", "This sprint", "Custom range"
- [ ] Filters apply to search results in real-time
- [ ] Clear all filters button

### Phase 2: Grouped results
- [ ] Results grouped by category: Tickets, Conversations, Comments
- [ ] Section headers with result count per category
- [ ] Collapse/expand sections
- [ ] Show max 5 results per category initially, "Show more" to expand

### Phase 3: Search improvements
- [ ] Search across ticket description and AC content (not just title)
- [ ] Highlight search term in results
- [ ] Search history: last 5 searches shown when input is empty
- [ ] "No results" state with suggestion to try Jira search

### Phase 4: Saved searches
- [ ] "Save this search" action that stores query + filters
- [ ] Saved searches accessible from search modal sidebar
- [ ] Max 10 saved searches
- [ ] Delete saved search

## Technical Notes

- Extend existing `/api/search/local` to accept filter parameters
- Full-text search on description requires SQLite FTS5 extension (evaluate performance vs LIKE queries)
- Search history stored in localStorage (no API needed)
- Saved searches stored in `appSetting` table as JSON

## Out of Scope (for now)
- Natural language search ("stories assigned to John without AC")
- Search within attachments/file content
- Real-time search-as-you-type for Jira (performance concern)
- Search result ranking/relevance scoring
