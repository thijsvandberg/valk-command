# BRDG-225: Improve Link Issue Search

**Status:** Completed
**Priority:** Medium
**Type:** Enhancement + Bug Fix

## Description

The "Add Related" search in the ticket detail view (LinkIssueDialog and inline LinkedIssuesSection) needs several improvements to make it more useful and consistent with the rest of the UI. Currently the search results are bare-bones (plain text keys, no sprint info, no filtering), deleted tickets show up in results, and the empty state only shows recently linked issues rather than contextually useful suggestions.

## User Story

As a PO linking related issues, I want a richer search experience so that I can quickly find and identify the right ticket without having to open each result separately.

## Current Behavior

- Search results are hard-capped at 15 results with no way to load more
- Search results show issue key as plain text, not as the styled ticket pill used elsewhere in the app
- No sprint information is visible in results
- No way to filter results (e.g. by status, sprint, or project)
- Deleted tickets (status = deleted or `removedFromJiraAt` is set) appear in search results
- Empty search field shows the last 5 previously linked issues only
- The inline search dropdown has limited vertical space, making it hard to browse through results

## Requirements

### Bug fix: exclude deleted tickets

- The search endpoint (`/api/tickets/search`) must filter out tickets where `status` is "deleted" (case-insensitive) or where `removedFromJiraAt` is set
- This applies to both the local search and the recent picks mode
- Affected file: `src/app/api/tickets/search/route.ts`

### Show sprint name in search results

- Display the sprint name next to each result (when available)
- Add `sprintName` to the search endpoint response
- Show it as a subtle label in the result row (similar to how status is shown)
- Position: between the title and the status badge

### Use ticket pill for issue key

- Replace the plain-text issue key in search results with the existing `TicketPill` component (or the same styling)
- The pill should show the issue type icon and the key, consistent with how tickets appear in the sprint board and other views
- Affected files: `LinkIssueDialog.tsx`, `LinkedIssuesSection.tsx` (inline search)

### Add status filter

- Add a filter bar/dropdown above the search results that allows filtering by status
- Available statuses should be derived from the current result set (not a hardcoded list)
- Multiple statuses can be selected at once
- Filter state persists during the current search session but resets when the dialog is closed
- Consider using small toggle chips/pills for common statuses (To Do, In Progress, Done) with an overflow for less common ones

### Load more results (infinite scroll)

- Remove the hard cap of 15 results from the search endpoint
- Implement cursor-based pagination: the endpoint accepts an `offset` parameter and returns results in pages of 25
- The dropdown list uses infinite scroll: when the user scrolls near the bottom, the next page is fetched automatically
- A small loading spinner appears at the bottom while the next page loads
- Affected file: `src/app/api/tickets/search/route.ts` (pagination), `LinkIssueDialog.tsx` / `LinkedIssuesSection.tsx` (infinite scroll)

### Expand to modal option

- Add an "expand" icon button inside the "Link issue..." input bar (right side), always visible even before typing
- Clicking it opens the search in a full modal dialog with more vertical space
- The modal reuses the same search input, filters, and result list, but renders them in a larger container with a scrollable result area
- If the user already typed a query in the inline input, carry it over to the modal search field
- The modal variant makes it easier to browse many results and apply filters
- Keyboard shortcut: when the inline search is focused, pressing `Cmd+Shift+K` / `Ctrl+Shift+K` opens the modal variant
- The existing `LinkIssueDialog` can serve as the base for this, but needs the same improvements (ticket pill, sprint, filters, infinite scroll)

### Improve empty state with recently viewed/modified tickets

- When the search field is empty, show the most recently updated tickets from the local DB (ordered by `jiraUpdatedAt` desc) instead of only recently linked issues
- Limit to 10 results
- Label this section "Recently updated" or similar
- Still exclude deleted tickets and the current ticket from this list

## Components Affected

- `src/app/api/tickets/search/route.ts` - add sprintName to response, filter deleted tickets, add recently-updated mode
- `src/components/ticket-detail/LinkIssueDialog.tsx` - ticket pill, sprint label, status filter, empty state
- `src/components/ticket-detail/LinkedIssuesSection.tsx` - same changes for inline search variant

## Design Notes

- The status filter chips should match the existing status badge styling used in the sprint board
- Keep the search responsive: filters should work client-side on the already-fetched results (no extra API calls per filter change)
- The ticket pill in results should be compact (small variant) to avoid making rows too tall

## Out of Scope

- Project-level filtering (cross-project search)
- Saved/favorite filters
- Bulk linking multiple issues at once
- Changing the relation type UX (already works well)

## Implementation Plan

1. **Backend: filter deleted, add sprintName, pagination** (`src/app/api/tickets/search/route.ts`)
   - Add WHERE conditions: `LOWER(status) != 'deleted'` AND `removedFromJiraAt IS NULL`
   - Add `sprintName` to select clause and SearchResult interface
   - Replace `recentOnly` branch: query `ticket` table by `jiraUpdatedAt DESC` (limit 10) instead of `ticketLink`
   - Add `offset` query param, change page size to 25, return `{ results, hasMore }`

2. **API client updates** (`src/lib/api-client.ts`)
   - Update return types to match `{ results, hasMore }` shape
   - Add `offset` parameter to search methods

3. **Extract shared hook** (`src/hooks/useLinkIssueSearch.ts`)
   - Consolidate duplicated debounce/search/abort logic from both components
   - Manage pagination state (offset, accumulated results, loadMore)
   - Client-side status filter derivation and filtering
   - Empty-state "recently updated" fetch

4. **Extract shared result row** (`src/components/ticket-detail/LinkSearchResultRow.tsx`)
   - TicketKeyPill instead of plain text key
   - Sprint name label between title and status badge
   - IssueTypeIcon, StatusBadge, Jira source badge

5. **Status filter chips** (`src/components/ticket-detail/StatusFilterChips.tsx`)
   - "All" chip + per-status chips derived from results
   - Uses JIRA_STATUS_COLORS for coloring

6. **Update LinkedIssuesSection** (inline search)
   - Use shared hook + shared result row
   - Add status filter chips in dropdown
   - Add scroll sentinel for infinite scroll
   - Add expand-to-modal button in input bar
   - Show "Recently updated" empty state

7. **Update LinkIssueDialog** (modal)
   - Use shared hook + shared result row
   - Add status filter chips + infinite scroll
   - Add `initialQuery` prop for expanded mode
   - Larger modal size for expanded mode

8. **Tests**
   - `route.test.ts`: deleted excluded, sprintName, pagination, recently updated
   - `useLinkIssueSearch.test.ts` or `StatusFilterChips.test.tsx`: status filter logic

## Checklist

- [x] Filter out deleted tickets from search results (status = deleted or removedFromJiraAt is set)
- [x] Filter out deleted tickets from recent picks
- [x] Add `sprintName` field to search endpoint response
- [x] Display sprint name in search result rows
- [x] Replace plain-text issue key with TicketPill component in search results
- [x] Add status filter chips above search results
- [x] Derive available statuses from current result set
- [x] Replace empty-state "recent picks" with recently updated tickets (limit 10)
- [x] Implement cursor-based pagination in search endpoint (offset param, page size 25)
- [x] Implement infinite scroll in search result list (load next page on scroll near bottom)
- [x] Add expand-to-modal button on inline search dropdown
- [x] Build modal variant with larger scrollable result area
- [x] Apply same improvements to both LinkIssueDialog and inline LinkedIssuesSection
- [x] Tests for search endpoint: deleted tickets excluded, sprintName included, pagination
- [x] Tests for status filter logic
- [x] Manual test: search, filter by status, verify no deleted tickets appear, verify empty state
- [x] Manual test: scroll to load more results, expand to modal
