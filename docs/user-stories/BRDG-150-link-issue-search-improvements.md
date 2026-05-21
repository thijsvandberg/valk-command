# BRDG-150: Link Issue Search Improvements

**Status:** In Progress
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

## Implementation Plan

1. **Checkbox 1 (pre-satisfied):** `jiraClient.searchIssues()` already exists at `src/lib/jira-client.ts:1052`. Mark done.
2. **Checkbox 2 (backend):** In `/api/tickets/search/route.ts`, lower Jira fallback threshold from "zero local results" to "fewer than 5". Add `source: "local" | "jira"` field to each result. Add `?jira=1` query param so frontend can do two-phase search (local-only first, then local+Jira). Deduplicate by key (local wins).
3. **Checkbox 4 backend:** Add `?recent=1` path to the same route. Query `ticketLink` table for 5 most recently linked issues (distinct, excluding current ticket). Return with `source: "recent"`.
4. **Checkbox 6 (tests):** Write tests for sparse fallback, dedup, recent picks, `?jira=0` skipping Jira, graceful Jira failure.
5. **Checkbox 3 (frontend):** Update types in api-client and LinkIssueDialog. Implement two-phase search: fire local-only immediately, then fire `?jira=1` after 300ms if local < 5. Show "Searching Jira..." text. Add subtle "Jira" badge on jira-source results.
6. **Checkbox 4 frontend:** Fetch recent picks when search is empty, render "Recent" section with Clock icon.
7. **Checkbox 5 (frontend):** Add StatusBadge to result rows and selected chip. Improve truncation. Align hover/active styles with SearchModal (left border accent on highlight).

### Key decisions
- "Recent" = most recently created links globally (not per-ticket), which gives broadest usefulness
- Local results always win in dedup (same key from both sources)
- Two-phase frontend approach lets us show local results instantly while Jira loads

## Implementation Notes

### Reuse from existing code

- **`SearchModal`** (`src/components/sprint-board/SearchModal.tsx`): keyboard navigation, result rendering with status pills and type icons. The Link dialog already has keyboard nav, but the visual presentation could be improved to match.
- **`/api/tickets/search`** (`src/app/api/tickets/search/route.ts`): current local search endpoint. Extend it with an optional `?jiraFallback=true` param or create a new route.
- **`jiraClient`** (`src/lib/jira-client.ts`): add a `searchIssues(query)` method using Jira's issue picker or JQL endpoint for the fallback.

### Checklist

- [x] Add `jiraClient.searchIssues(query)` method (issue picker REST endpoint) <!-- pre-satisfied: method already exists at jira-client.ts:1052 -->
- [x] Extend `/api/tickets/search` with Jira fallback when local results are sparse
- [x] Show Jira-only results with a subtle indicator (not in local DB)
- [x] Add recent/frequent quick picks when search is empty
- [x] Match visual style with `SearchModal` (status pills, better truncation)
- [x] Tests for the extended search route
