# BRDG-094: Stakeholder View - Epic Filter Chips

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want stakeholders to be able to filter the sprint ticket columns by epic so they can focus on the work that is most relevant to them without being overwhelmed by unrelated tickets.

## Acceptance Criteria

- [ ] A row of epic filter chips is shown above the ticket columns when the sprint contains tickets from 2 or more epics
- [ ] Each chip displays the epic name and the count of tickets from that epic in the current sprint
- [ ] An "All" chip is always present; clicking it deselects all active filters and shows all tickets
- [ ] Clicking an epic chip toggles that epic's filter on or off; multiple epics can be active simultaneously (OR logic)
- [ ] When one or more epic filters are active, only tickets belonging to a selected epic are shown in the columns
- [ ] The chip row is not rendered when the sprint contains tickets from fewer than 2 epics
- [ ] Filter state is local to the component and is not reflected in the URL or persisted

## Technical Notes

- Epic names and ticket-to-epic mapping are already available in the stakeholder-transformed ticket data
- Derive the list of epics and per-epic counts from the currently loaded sprint tickets on the client side; no additional API calls required
- "All" chip should be visually distinguished from individual epic chips (e.g. always leftmost, different styling when active)
- When filters are active, the "All" chip should appear in its unselected state to signal that filtering is applied
- Ticket count shown on each chip reflects the total for that epic in the sprint, not just the visible (filtered) count

## Out of Scope

- Persisting filter selections across sessions or in the URL
- Filtering by assignee, status, or label
- Multi-level filtering (epic + another dimension simultaneously)
- Epic filter chips in the main sprint board view
