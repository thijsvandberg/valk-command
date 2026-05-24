# BRDG-167: Refinement Indicator on Tickets

**Status:** Done
**Priority:** Low
**Related:** BRDG-166 (Saved Refinement Sessions), BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want to see at a glance which tickets are scheduled for a refinement session, both on the sprint board and in the ticket detail view, so I know which stories are already queued for discussion.

## Context

Once saved refinement sessions exist (BRDG-166), tickets can be assigned to upcoming sessions. This story surfaces that information across the app so the PO does not accidentally skip or double-refine tickets.

## Implementation Plan

1. **Create `useTicketSessionMap` hook** (`src/hooks/useTicketSessionMap.ts`): Wraps `useRefinementSessions()`, builds a memoized `Map<string, { id: string; name: string }[]>` mapping each ticket key to its draft sessions. Shared by all three areas.

2. **Sprint board indicator**: Add `refinementSessions` optional prop to `TicketRowBaseProps`. Render a small `Layers` icon inside the `"key"` cell (next to follow star) wrapped in a `Tooltip` showing session name(s). Pass the map from `TicketTable` -> `TicketRow` and from `SprintBoard`/`MultiSprintView` -> `TicketTable`.

3. **Ticket detail sidebar**: Call `useTicketSessionMap()` in `TicketSidebar`. After the Sprint row, show a "Refinement" `DetailRow` with clickable session name(s) linking to `/refinement?session={id}`. Hidden when not in any session.

4. **Deep-link support**: Read `searchParams.get("session")` in `RefinementPageInner` to initialize `activeSessionId`, enabling sidebar links.

5. **Refinement page indicators**: In the local `TicketRow`, show session name as a subtle badge. When a ticket is in a different session than the active one, show a non-blocking amber warning.

**Design decisions:**
- Overlay icon in key cell (not a new column) to avoid FilterBar/preset changes
- Only draft sessions shown (completed are archival)
- Single `Layers` icon regardless of session count; tooltip lists all

## Acceptance Criteria

### Sprint board

- [x] Tickets that are in a saved refinement session show a small indicator (icon or badge) in the ticket row
- [x] Hovering the indicator shows the session name in a tooltip
- [x] The indicator is visible in all sprint board views (table, grouped, filtered)

### Ticket detail view

- [x] The ticket detail sidebar shows which refinement session(s) the ticket belongs to
- [x] Clicking the session name navigates to the refinement page with that session active
- [x] If the ticket is not in any session, nothing is shown (no empty state clutter)

### Refinement page

- [x] In the ticket selection list, tickets already in a session show which session they belong to
- [x] Selecting a ticket that is already in another session shows a subtle warning (not blocking)

## Technical Notes

- Requires BRDG-166 (saved sessions) to be implemented first
- Query: join tickets with `refinement_session` where `ticketKeys` JSON contains the ticket key
- Consider a denormalized `refinement_session_ticket` junction table for efficient lookups if JSON scanning is too slow
- Sprint board indicator: add an optional column or overlay icon to the existing `TicketTable` component

## Out of Scope

- Filtering sprint board by "in refinement" / "not in refinement"
- Bulk add/remove from refinement via sprint board context menu
