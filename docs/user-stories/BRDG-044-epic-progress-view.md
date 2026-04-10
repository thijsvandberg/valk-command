# BRDG-044: Epic Progress View

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want an Epic-level view that aggregates all tickets per epic, shows completion percentage, total and remaining points, and a timeline bar so I can track feature-level progress across sprints.

## Acceptance Criteria

### Phase 1: Epic list page
- [ ] New page at `/epics` or a tab within the Sprint Board
- [ ] List all epics that have tickets in recent sprints (last 3 sprints + backlog)
- [ ] Each epic row shows: epic name, color/icon, total tickets, completed tickets, total points, completed points

### Phase 2: Progress visualization
- [ ] Horizontal progress bar per epic showing completion percentage (points-based)
- [ ] Color-coded segments: done (green), in-progress (amber), todo (gray)
- [ ] Percentage label on the bar

### Phase 3: Epic detail expansion
- [ ] Click epic row to expand and show all tickets grouped by status
- [ ] Each ticket shows: key, title, status badge, assignee, sprint
- [ ] Link to ticket detail page

### Phase 4: Cross-sprint timeline
- [ ] Timeline bar showing which sprints an epic spans
- [ ] Markers for sprint boundaries
- [ ] Visual indication of which sprints have completed tickets vs remaining

## Technical Notes

- Epic data comes from the `epic` field already synced on tickets
- Aggregate queries on the ticket table grouped by epic
- No new database tables needed; all derived from existing ticket data
- Cache epic aggregations with SWR (refresh on sync)

## Out of Scope (for now)
- Epic creation or editing from Bridge
- Epic-level story writer (batch per epic)
- Roadmap view with drag-and-drop scheduling
- Epic dependencies
