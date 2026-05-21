# BRDG-150: Link Issue Search Improvements

**Status:** Draft
**Priority:** Medium

## Description

As the PO, I want the Link Issue dialog's search to be faster and more capable, so I can quickly find and link related issues without frustration.

The current search (`/api/tickets/search`) only does a basic SQLite LIKE query against locally synced tickets. This means:
- Issues not yet synced to the local DB cannot be found
- No fuzzy matching or ranking by relevance
- No recent/frequent issues shown as quick picks

The sprint board's `SearchModal` has a more sophisticated search with keyboard navigation, status pills, and type icons. We should reuse patterns from there.

## Current Behavior

1. User types in the Link Issue dialog's search field
2. A `LIKE %query%` search runs against the local `ticket` table
3. Results show key, title, and type icon
4. If the issue is not in the local DB, it cannot be found at all
5. No Jira fallback search

## Desired Behavior

1. Local DB search stays as the fast primary source (current behavior)
2. If local results are fewer than 5, also query Jira REST API as fallback (`/rest/api/3/issue/picker` or JQL search)
3. Show a "Searching Jira..." indicator when the fallback is running
4. Deduplicate results (local + Jira)
5. Optionally show 3-5 recently linked issues as quick picks when the search field is empty

## Implementation Notes

### Reuse from existing code

- **`SearchModal`** (`src/components/sprint-board/SearchModal.tsx`): keyboard navigation, result rendering with status pills and type icons. The Link dialog already has keyboard nav, but the visual presentation could be improved to match.
- **`/api/tickets/search`** (`src/app/api/tickets/search/route.ts`): current local search endpoint. Extend it with an optional `?jiraFallback=true` param or create a new route.
- **`jiraClient`** (`src/lib/jira-client.ts`): add a `searchIssues(query)` method using Jira's issue picker or JQL endpoint for the fallback.

### Checklist

- [ ] Add `jiraClient.searchIssues(query)` method (issue picker REST endpoint)
- [ ] Extend `/api/tickets/search` with Jira fallback when local results are sparse
- [ ] Show Jira-only results with a subtle indicator (not in local DB)
- [ ] Add recent/frequent quick picks when search is empty
- [ ] Match visual style with `SearchModal` (status pills, better truncation)
- [ ] Tests for the extended search route
