# BRDG-053: Advanced Search with Filters

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want the search modal to support filters (status, sprint, assignee, date range) and show results grouped by category so I can find things faster in a growing dataset.

## Implementation Plan

1. **Create `/api/search/local/filter-options/route.ts`** — GET endpoint returning `{ assignees: string[], sprints: { id: string, name: string }[] }` from DB (`ticket.assignee` distinct values + `jira_sprints` app_setting + `sprintNameCache` table fallback). No dependency on other steps.

2. **Extend `/api/search/local/route.ts`** — Parse additional query params: `status` (CSV), `type` (CSV), `assignee` (CSV), `sprint` (CSV), `dateRange` (single). Apply as post-Fuse predicates before `.slice(0, 25)`. Bump Fuse limit to 500 when any filter is active. Date range applied on `jiraUpdatedAt`; "this-sprint" uses the top sprint IDs from the cache. Status comparison is case-insensitive uppercase; type comparison is case-insensitive lowercase; assignee is case-insensitive. No dependency on other steps.

3. **Create `src/components/sprint-board/SearchFilterPanel.tsx`** — Defines `SearchFilters` interface, `EMPTY_FILTERS` constant, hard-coded `STATUS_OPTIONS`/`TYPE_OPTIONS`/`DATE_RANGE_OPTIONS`, `STATUS_DISPLAY_MAP` (`TEST` → "In Review"), `hasActiveFilters` helper, `filtersToParams` helper. Renders a horizontal strip of `FilterDropdown` components (Status, Type, Sprint, Assignee) plus a date range single-select. Accepts `filters`, `onChange`, `filterOptions` props. Includes "Clear all" button when any filter is active. Depends on FilterDropdown (existing).

4. **Integrate into `SearchModal.tsx`** — Add `showFilters`/`filters`/`filterOptions` state. Add `ListFilter` icon toggle button in header (after mode toggle, before close button, only visible in local mode). Toggle button shows brand-colored dot indicator when `hasActiveFilters`. Fetch filter-options when panel is first opened. Render `<SearchFilterPanel>` conditionally between detected-key banner and results area. Add filters to `runLocalSearch` URL params. Add `filters` to effect dependencies. Reset `showFilters` and `filters` on modal close. Depends on steps 2 and 3.

5. **Tests** — Extend `SearchModal.test.tsx`: filter toggle visible/hidden per mode, filter panel shows on toggle, dot indicator with active filters, reset on close, clear-all visibility. Extend/create route tests for filtered search params.

**Implementation order:** Steps 1+2+3 in parallel → Step 4 → Step 5

**Edge cases:**
- `ticket.status` is uppercase (e.g. "TO DO", "IN PROGRESS", "TEST"). Display "TEST" as "In Review" via label map.
- `ticket.sprintName` stores the sprint ID string, not the display name. Filter-options returns `{ id, name }` pairs; the `sprint` param takes IDs.
- Fuse limit bumped to 500 when filters active to avoid over-filtering the candidate pool.
- Empty query with filters: search still requires ≥2 chars (Phase 1 limitation; noted in follow-up BRDG-083).

## Acceptance Criteria

### Phase 1: Search filter bar
- [x] Add a toggle button (filter icon) in the search modal header to show/hide the filter panel; filters are collapsed by default
- [x] Toggle button shows a visual indicator (dot) when one or more filters are active
- [x] Filter panel appears below the search bar when toggled, local mode only (not Jira mode)
- [x] Filter options: Status (multi-select), Type (multi-select: Story/Bug/Task/Spike/Epic), Sprint (multi-select), Assignee (multi-select)
- [x] Date range filter: "Last 7 days", "Last 30 days", "This sprint", "Custom range"
- [x] Filter option values (Sprint, Assignee) are fetched from the full DB on filter panel open, not derived from current search results
- [x] Status and Type values are hard-coded: Status (To Do, In Progress, In Review, Done, Deprecated), Type (Story, Bug, Task, Spike, Epic)
- [x] Filters are applied server-side: passed as query params to `/api/search/local`, applied after Fuse scoring against the full dataset
- [x] Filters reset when the modal is closed (no persistence)
- [x] "Clear all" button visible only when at least one filter is active

### Phase 2: Grouped results
<!-- Moved to BRDG-083 -->

### Phase 3: Search improvements
<!-- Moved to BRDG-084 -->

### Phase 4: Saved searches
<!-- Moved to BRDG-085 -->

## Technical Notes

### Phase 1
- Filter panel is local-mode only; Jira mode keeps JQL override as its power-user filter
- Extend `/api/search/local` to accept filter query params: `status`, `type`, `assignee`, `sprint`, `dateRange`
- Add a `/api/search/local/filter-options` endpoint to return all available Sprint and Assignee values from the DB
- Filters applied post-Fuse as exact-match predicates; date range applied on `jiraUpdatedAt`
- Filter state lives in component state and resets on modal close

## Out of Scope (for now)
- Natural language search ("stories assigned to John without AC")
- Search within attachments/file content
- Real-time search-as-you-type for Jira (performance concern)
- Search result ranking/relevance scoring
