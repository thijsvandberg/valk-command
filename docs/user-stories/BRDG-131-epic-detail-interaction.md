# BRDG-131: Epic Detail Interaction on Sprint Board

**Status:** Draft
**Priority:** Medium
**Depends on:** -

## Description

As the PO, I want to click on an epic label in the sprint backlog to see detailed information about that epic, filter tickets by epic, and change a ticket's epic assignment, so I can manage epics without leaving the sprint board context.

## Related work

- **BRDG-249** (shipped): the epic picker pill and each picker row in the ticket detail sidebar now link through to the epic's own ticket detail page (`/tickets/[epicKey]`), with Cmd/Ctrl-click for a new tab. This gives a basic "open the epic" path via the existing ticket detail page, and partially answers the "where should epic info appear" question below: the epic's full detail is reachable as a normal ticket page. The epic picker (Phase 3 below) already exists with search + Jira sync. What BRDG-131 still adds on top: epic interaction *from the sprint board pill* (not just the sidebar), inline epic stats/filtering without navigating away, and the epic-context sidebar.

## Open Questions

- Where should epic info appear: popover, sidebar section, or dedicated panel?
- Should epic description be editable from Bridge, or read-only (synced from Jira)?
- Do we need to sync epic-level data (description, status, owner) from Jira, or do we already have it?
- How does changing a ticket's epic propagate back to Jira?

## Acceptance Criteria

### Phase 1: Epic info display
- [ ] Clicking an epic pill in the sprint backlog opens an epic detail view
- [ ] Shows: epic name, ticket count (open/closed breakdown)
- [ ] Shows status distribution of tickets in this epic (TO DO / IN PROGRESS / TEST / DONE)
- [ ] Click does not trigger the row selection (side panel)

### Phase 2: Filter integration
- [ ] "Show only this epic" action that sets the epic filter on the sprint board
- [ ] "Show across all sprints" action that switches to All view + filters by this epic
- [ ] Clear filter option to reset

### Phase 3: Epic assignment
- [ ] Ability to change the epic for a ticket from the sprint board
- [x] Epic picker dropdown with search <!-- exists: EpicPicker (src/components/shared/EpicPicker.tsx), now also links through to the epic via BRDG-249 -->
- [ ] Change syncs back to Jira

### Phase 4: Epic sidebar info
- [ ] When an epic is selected, the sidebar shows epic-level context
- [ ] Epic description (from Jira)
- [ ] Related tickets list with status indicators
- [ ] Story point total and progress

## Technical Notes

- Check if epic descriptions are already synced in the Jira sync pipeline
- Epic assignment changes need the Jira REST API (PUT /rest/api/3/issue/{key})
- Consider reusing the existing sidebar panel pattern for epic details
- The epic pill click handler should stopPropagation to prevent row selection
