# BRDG-183: Refinement Session Lifecycle & End Modal

**Status:** In Progress
**Priority:** High

## Description

As the PO, I want a clear distinction between leaving a refinement session (to continue later) and completing it, so that sessions persist on the refinement page and I can add per-ticket PO messages and a general comment before finishing.

## Implementation Plan

1. **Schema & migration** -- Add `general_comment` (text), `current_index` (int default 0) to `refinement_session`; expand status enum to `["draft","in_progress","completed"]`; create `refinement_session_ticket_note` join table (id, session_id FK, ticket_key, content, timestamps) with unique constraint on (session_id, ticket_key). Generate Drizzle migration.
2. **API layer** -- Update PATCH `/api/refinement-sessions/[id]` to accept `generalComment`, `currentIndex`, and `in_progress` status. Create `PUT/GET /api/refinement-sessions/[id]/ticket-notes` sub-resource. Update `RefinementSessionResponse` type and api-client methods.
3. **Context provider** -- Replace `endSession()` with `openEndModal()`, `closeEndModal()`, `saveSession()`, `finishSession()`. Add `showingEndModal` state. Debounce-persist `currentIndex` on navigation.
4. **Header overflow menu** -- Replace exit button with three-dot menu containing "Exit session". Wire to `openEndModal()`. Also wire last-ticket next to `openEndModal()`.
5. **End modal** -- New `SessionEndModal` component: ticket list with per-ticket PO message editors, general comment field, Close/Save and Done/Finish buttons with smart primary logic (based on story point completeness).
6. **Session persistence & overview** -- Update all status filters (`SavedSessionList`, `RefinementPageContent`, `useTicketSessionMap`, `AddToRefinementModal`) to treat `in_progress` as open. Resume sessions at persisted `currentIndex`. Visual indicator for in-progress sessions.
7. **Cleanup** -- Move `SessionSummary` to `deleted/`, update affected tests.

## Acceptance Criteria

### 1. Move "Exit" into a "..." overflow menu
- [x] Replace the visible "Exit" button in the refinement header with a three-dot overflow menu (far right)
- [x] The overflow menu contains an "Exit session" action
- [x] Clicking "Exit session" navigates to the end modal (same as finishing the last ticket)

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
- [x] Add a session status that supports open/in-progress sessions (currently only `draft` and `completed`)
- [x] Add a `general_comment` field to the refinement session table
- [x] Add a table or field for per-ticket PO messages within a session
- [x] Persist `currentIndex` so sessions can be resumed at the right ticket

## Technical Notes

- Current exit flow: `endSession()` in `RefinementSessionContext.tsx` immediately sets status to `completed`
- The end modal is a new component; consider placing it in `src/components/refinement-session/`
- Session status enum currently: `draft`, `completed`; needs at least `in_progress` or `active`
- PO messages could be stored in a `refinement_session_ticket_note` join table (session_id, ticket_key, message)

## Dependencies

- BRDG-182 (refinement session UI polish)
