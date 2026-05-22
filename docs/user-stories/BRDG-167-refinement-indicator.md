# BRDG-167: Refinement Indicator on Tickets

**Status:** Open
**Priority:** Low
**Related:** BRDG-166 (Saved Refinement Sessions), BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want to see at a glance which tickets are scheduled for a refinement session, both on the sprint board and in the ticket detail view, so I know which stories are already queued for discussion.

## Context

Once saved refinement sessions exist (BRDG-166), tickets can be assigned to upcoming sessions. This story surfaces that information across the app so the PO does not accidentally skip or double-refine tickets.

## Acceptance Criteria

### Sprint board

- [ ] Tickets that are in a saved refinement session show a small indicator (icon or badge) in the ticket row
- [ ] Hovering the indicator shows the session name in a tooltip
- [ ] The indicator is visible in all sprint board views (table, grouped, filtered)

### Ticket detail view

- [ ] The ticket detail sidebar shows which refinement session(s) the ticket belongs to
- [ ] Clicking the session name navigates to the refinement page with that session active
- [ ] If the ticket is not in any session, nothing is shown (no empty state clutter)

### Refinement page

- [ ] In the ticket selection list, tickets already in a session show which session they belong to
- [ ] Selecting a ticket that is already in another session shows a subtle warning (not blocking)

## Technical Notes

- Requires BRDG-166 (saved sessions) to be implemented first
- Query: join tickets with `refinement_session` where `ticketKeys` JSON contains the ticket key
- Consider a denormalized `refinement_session_ticket` junction table for efficient lookups if JSON scanning is too slow
- Sprint board indicator: add an optional column or overlay icon to the existing `TicketTable` component

## Out of Scope

- Filtering sprint board by "in refinement" / "not in refinement"
- Bulk add/remove from refinement via sprint board context menu
