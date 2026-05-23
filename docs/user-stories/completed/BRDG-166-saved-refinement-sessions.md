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

- [x] "New session" button on the refinement page creates a new saved session with a name (default: "Refinement <date>")
- [x] Session name is editable inline (click to rename)
- [x] Multiple saved sessions can exist side by side, shown as a list or tabs above the ticket selection area
- [x] Each session has its own queue of tickets with drag-to-reorder
- [x] A session can be deleted (with confirmation)

### Ticket management within a session

- [x] Add tickets to the session from the ticket list (same selection UI as today)
- [x] Remove tickets from the session queue (X button)
- [x] Move a ticket from one session to another (context menu or drag between sessions)
- [x] Session ticket count is shown in the session tab/card

### Starting a session

- [x] "Start" button on a saved session begins the refinement with its ticket queue
- [x] After starting, the session continues to exist (not deleted)
- [x] Completed sessions are visually distinguished from pending ones

### Persistence

- [x] Sessions are stored in the local SQLite database (new table: `refinement_session`)
- [x] Schema: `id`, `name`, `ticketKeys` (JSON array), `status` (draft/completed), `createdAt`, `updatedAt`
- [x] API endpoints: CRUD for sessions (`/api/refinement-sessions`)

## Technical Notes

- New DB table `refinement_session` with Drizzle schema
- New API routes: `GET/POST /api/refinement-sessions`, `PATCH/DELETE /api/refinement-sessions/[id]`
- The refinement page should show saved sessions as the primary view, with "Quick session" for the current ad-hoc flow
- Consider using the existing `RefinementSessionContext` for the active session, loading from DB on start

## Implementation Plan

1. **Add `refinement_session` table** to `src/db/schema.ts` with fields: `id`, `name`, `ticketKeys` (JSON text), `status` (draft/completed), `createdAt`, `updatedAt`. Generate migration.
2. **Create CRUD API routes**: `GET/POST /api/refinement-sessions` and `GET/PATCH/DELETE /api/refinement-sessions/[id]`. Follow jobs API pattern.
3. **Add API client + SWR hook**: `refinementSessions` namespace in `api-client.ts`, `useRefinementSessions` hook.
4. **Build `SavedSessionList` component**: Horizontal tab bar with session tabs, "New session" button, inline rename, delete with confirm, ticket count badge, completed visual distinction.
5. **Refactor refinement page**: Integrate `SavedSessionList`, add `activeSessionId` state, persist queue changes to API on add/remove/reorder, keep "Quick session" for ad-hoc flow.
6. **Cross-session ticket movement**: Context menu on queue items with "Move to..." submenu listing other sessions.
7. **Connect Start button**: Load saved session's `ticketKeys` into `RefinementSessionContext`, store `savedSessionId`, navigate to session page.
8. **Mark session completed**: When `endSession()` fires with a `savedSessionId`, PATCH status to "completed".
9. **Update docs**: Add table to `database-schema.md`, routes to `api-routes.md`.
10. **Tests**: API route tests, hook tests, component tests, context tests.

**Design decisions:**
- Context menu for cross-session moves (not multi-container DnD)
- Optimistic updates with SWR `mutate()`, debounced PATCH for queue changes
- Tickets can appear in multiple sessions
- Completed sessions can be restarted (resets to draft)
- "Quick session" pinned tab for ephemeral ad-hoc flow

## Out of Scope

- Sharing sessions with other users
- Scheduling sessions at a specific time
- Integration with calendar
