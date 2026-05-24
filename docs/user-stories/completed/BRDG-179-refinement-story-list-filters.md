# BRDG-179: Refinement Story List Filters and Information

**Status:** Done
**Priority:** Medium

## Description

As a PO, I want the refinement story list to have better filtering, more visible ticket metadata, and smarter defaults so I can quickly find the tickets that actually need refinement.

## Current State

The refinement "Select tickets" list currently shows:
- Ticket key, Jira status, readiness indicator, title, sprint label, subtask count (partial)
- A "Pinned sprints" toggle that uses the sprint slot config
- A free-text search field

## Implementation Plan

1. **Refactor filtering pipeline** -- Extract base ticket filtering (status/type/removed exclusions) into its own `baseTickets` memo. `filteredTickets` applies sprint/estimated/epic/lastUpdated on top of that. Search uses `baseTickets` directly, bypassing all filters.
2. **Add filter state** -- `hideEstimated` (default true), `epicFilter` (Set, default empty = all), `lastUpdatedFilter` (default "4w"). Plus `LAST_UPDATED_OPTIONS` constant.
3. **Compute epic options** -- `useMemo` extracting distinct epic names from `baseTickets` for the epic filter dropdown.
4. **Update `filteredTickets`** -- Add hide-estimated, epic, and last-updated filter conditions.
5. **Rename sprint filter label** -- Change "Pinned sprints" to "Pinned" with "Sprint:" prefix on button.
6. **Build filter bar UI** -- Row below search: Sprint dropdown, Epic FilterDropdown, Last Updated dropdown, Hide Estimated toggle.
7. **Epic badge on TicketRow** -- Colored badge using `getEpicColor`. Placed after title.
8. **Subtask count on TicketRow** -- `open/total subtasks` badge, hidden when both 0.
9. **Search bypass** -- `availableTickets` memo searches `baseTickets` when query is active, `sortedTickets` when empty.

All changes in `RefinementPageContent.tsx`. No API changes needed.

## Acceptance Criteria

### Filters

- [x] Rename "Pinned sprints" to a proper sprint filter dropdown (current behavior stays the same, but framing changes from toggle to filter)
- [x] Add "Hide estimated" filter (default: ON). When active, tickets with story points are hidden from the list. User can toggle it off to see all tickets including estimated ones.
- [x] Add an epic filter. Show a dropdown with all epics present in the current ticket list. Support multi-select. Default: all epics.
- [x] Add a "Last updated" filter. Options: 1 week, 2 weeks, 4 weeks (default), 3 months, all. Filters on `jiraUpdatedAt`. Tickets updated more recently than the threshold are shown.

### Search behavior

- [x] When the search field has input, ignore all filters (sprint, estimated, epic, last updated) and search across all available tickets. This prevents the user from getting zero results because a filter is hiding the ticket they are looking for.

### Ticket row metadata

- [x] Show the epic name as a badge on each ticket row (use `ticket.epic`). Use a subtle, colored badge similar to the sprint label style.
- [x] Show subtask count on every ticket row (currently partially shown). Format: `{openSubtaskCount}/{totalSubtaskCount}` subtasks, or hide when both are 0.

## Technical Notes

- All data needed is already available in the ticket API response: `epic`, `epicKey`, `storyPoints`, `jiraUpdatedAt`, `openSubtaskCount`, `totalSubtaskCount`
- No API changes required; all filtering is client-side
- Filter state lives in the refinement page component (local state, no persistence needed)
- The filtering logic is in `filteredTickets` useMemo in `src/app/(app)/refinement/page.tsx` (around line 365)
- Sprint filter already uses `SprintListModal`; the epic filter can follow a similar pattern
- The "Last updated" filter should compare `jiraUpdatedAt` against `Date.now() - threshold`

## UI Layout

Filter bar (below search, or integrated as chips/dropdowns next to the search bar):
```
[Search tickets...]
[Sprint: Pinned v] [Epic: All v] [Updated: 4 weeks v] [x Hide estimated]
```

## Dependencies

None
