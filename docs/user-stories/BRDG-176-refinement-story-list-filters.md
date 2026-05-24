# BRDG-176: Refinement Story List Filters and Information

**Status:** Not Started
**Priority:** Medium

## Description

As a PO, I want the refinement story list to have better filtering, more visible ticket metadata, and smarter defaults so I can quickly find the tickets that actually need refinement.

## Current State

The refinement "Select tickets" list currently shows:
- Ticket key, Jira status, readiness indicator, title, sprint label, subtask count (partial)
- A "Pinned sprints" toggle that uses the sprint slot config
- A free-text search field

## Acceptance Criteria

### Filters

- [ ] Rename "Pinned sprints" to a proper sprint filter dropdown (current behavior stays the same, but framing changes from toggle to filter)
- [ ] Add "Hide estimated" filter (default: ON). When active, tickets with story points are hidden from the list. User can toggle it off to see all tickets including estimated ones.
- [ ] Add an epic filter. Show a dropdown with all epics present in the current ticket list. Support multi-select. Default: all epics.
- [ ] Add a "Last updated" filter. Options: 1 week, 2 weeks, 4 weeks (default), 3 months, all. Filters on `jiraUpdatedAt`. Tickets updated more recently than the threshold are shown.

### Search behavior

- [ ] When the search field has input, ignore all filters (sprint, estimated, epic, last updated) and search across all available tickets. This prevents the user from getting zero results because a filter is hiding the ticket they are looking for.

### Ticket row metadata

- [ ] Show the epic name as a badge on each ticket row (use `ticket.epic`). Use a subtle, colored badge similar to the sprint label style.
- [ ] Show subtask count on every ticket row (currently partially shown). Format: `{openSubtaskCount}/{totalSubtaskCount}` subtasks, or hide when both are 0.

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
