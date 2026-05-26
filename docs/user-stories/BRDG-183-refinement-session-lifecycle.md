# BRDG-183: Refinement Session Lifecycle & End Modal

**Status:** Not Started
**Priority:** High

## Description

As the PO, I want a clear distinction between leaving a refinement session (to continue later) and completing it, so that sessions persist on the refinement page and I can add per-ticket PO messages and a general comment before finishing.

## Acceptance Criteria

### 1. Move "Exit" into a "..." overflow menu
- [ ] Replace the visible "Exit" button in the refinement header with a three-dot overflow menu (far right)
- [ ] The overflow menu contains an "Exit session" action
- [ ] Clicking "Exit session" navigates to the end modal (same as finishing the last ticket)

### 2. End modal after exit or finishing last ticket
- [ ] Both the overflow menu "Exit session" and navigating past the last ticket lead to the same end modal/page
- [ ] The end modal shows:
  - All session tickets as a list: ticket key (in standard pill form) + title per row
  - Behind each ticket: a button to add a PO message (inline or mini-editor)
  - A general comment field (always visible, always saved to the session)
- [ ] Two action buttons at the bottom:
  - **Close / Save**: leaves the session flow but keeps the session open (status remains `draft`/`in_progress`); the session stays visible on the refinement overview page
  - **Done / Finish**: marks the session as `completed`

### 3. Smart primary button logic
- [ ] If not all tickets have story points assigned (excluding spikes), the **Finish** button is primary (encouraging the user to go back and estimate)
- [ ] If all applicable tickets have story points, the **Close/Save** button is primary

### 4. Session persistence
- [ ] Exiting via "Close/Save" keeps the session in an open state so it can be resumed later
- [ ] The refinement overview page shows open sessions and allows resuming them
- [ ] The general comment is persisted to the database on the session record
- [ ] PO messages per ticket are persisted (linked to the session + ticket)

### 5. Schema changes
- [ ] Add a session status that supports open/in-progress sessions (currently only `draft` and `completed`)
- [ ] Add a `general_comment` field to the refinement session table
- [ ] Add a table or field for per-ticket PO messages within a session
- [ ] Persist `currentIndex` so sessions can be resumed at the right ticket

## Technical Notes

- Current exit flow: `endSession()` in `RefinementSessionContext.tsx` immediately sets status to `completed`
- The end modal is a new component; consider placing it in `src/components/refinement-session/`
- Session status enum currently: `draft`, `completed`; needs at least `in_progress` or `active`
- PO messages could be stored in a `refinement_session_ticket_note` join table (session_id, ticket_key, message)

## Dependencies

- BRDG-182 (refinement session UI polish)
