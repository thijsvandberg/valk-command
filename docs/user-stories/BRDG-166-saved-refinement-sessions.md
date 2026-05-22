# BRDG-166: Saved Refinement Sessions

**Status:** Open
**Priority:** Medium
**Related:** BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want to prepare refinement sessions ahead of time by saving a named selection of tickets, so I can build up the agenda over time and start the session with one click when the ceremony begins.

## Context

Currently, refinement sessions are ephemeral: you select tickets and immediately start. This story adds persistence so sessions can be created in advance, edited (add/remove/reorder tickets), and started later. Multiple saved sessions can exist in parallel.

## Acceptance Criteria

### Session management

- [ ] "New session" button on the refinement page creates a new saved session with a name (default: "Refinement <date>")
- [ ] Session name is editable inline (click to rename)
- [ ] Multiple saved sessions can exist side by side, shown as a list or tabs above the ticket selection area
- [ ] Each session has its own queue of tickets with drag-to-reorder
- [ ] A session can be deleted (with confirmation)

### Ticket management within a session

- [ ] Add tickets to the session from the ticket list (same selection UI as today)
- [ ] Remove tickets from the session queue (X button)
- [ ] Move a ticket from one session to another (context menu or drag between sessions)
- [ ] Session ticket count is shown in the session tab/card

### Starting a session

- [ ] "Start" button on a saved session begins the refinement with its ticket queue
- [ ] After starting, the session continues to exist (not deleted)
- [ ] Completed sessions are visually distinguished from pending ones

### Persistence

- [ ] Sessions are stored in the local SQLite database (new table: `refinement_session`)
- [ ] Schema: `id`, `name`, `ticketKeys` (JSON array), `status` (draft/completed), `createdAt`, `updatedAt`
- [ ] API endpoints: CRUD for sessions (`/api/refinement-sessions`)

## Technical Notes

- New DB table `refinement_session` with Drizzle schema
- New API routes: `GET/POST /api/refinement-sessions`, `PATCH/DELETE /api/refinement-sessions/[id]`
- The refinement page should show saved sessions as the primary view, with "Quick session" for the current ad-hoc flow
- Consider using the existing `RefinementSessionContext` for the active session, loading from DB on start

## Out of Scope

- Sharing sessions with other users
- Scheduling sessions at a specific time
- Integration with calendar
