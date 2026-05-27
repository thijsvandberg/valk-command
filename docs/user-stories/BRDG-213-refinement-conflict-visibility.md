# BRDG-213: Refinement Page Conflict Visibility and Active Sync Check

**Status:** Done
**Priority:** High
**Related:** [BRDG-212](BRDG-212-refinement-save-push-flow.md)

## Description

As a PO, I want to see at a glance which tickets in the refinement queue or ticket list have Jira/local conflicts, and I want the system to actively verify conflict status when the page loads and when tickets are added to the session, so that I never start a refinement session with stale or conflicting data.

Currently the `Ticket` type already carries an `editState` field (`clean | draft | local_edits | conflict`) and `computeTicketEditState` handles the detection logic. However, the refinement home page does not surface this state visually, and the conflict check only happens passively through the global SWR ticket cache (which may be stale).

## Implementation Plan

1. **TicketRow badges** - Import `EditStateDot` from `sprint-board/TicketTableCells` into refinement `TicketRow`. Add conflict/local_edits/draft dots after `TicketStatusPill`, before title. Reuses existing tooltip + colors.
2. **SortableQueueItem badges** - Same `EditStateDot` import into queue items, placed after `IssueTypeIcon`.
3. **Queue panel header warning** - Compute `conflictCount` from `queueTickets`, show amber warning badge with `AlertTriangle` icon. Add `RefreshCw` button for manual re-check.
4. **Active sync in RefinementPageContent** - Surface `mutate`/`isValidating` from `useTickets("__all__")`. Call `mutateTickets()` on mount. Watch `queue` changes with debounced re-validation. Pass `ticketsValidating` + `onRefreshEditStates` to queue panel.
5. **Tests** - TicketRow: conflict/local_edits/draft/clean badge rendering. SortableQueueItem: same. Queue panel: conflict count display.

No new API endpoints needed. SWR `mutate()` re-fetches `/api/tickets` which already returns `editState`.

## Acceptance Criteria

### Conflict indicators on the refinement page

- [x] Tickets in the ticket list (`TicketRow`) show a small conflict badge/icon when `editState === "conflict"`
- [x] Tickets in the ticket list show a subtle "local edits" indicator when `editState === "local_edits"` or `editState === "draft"`
- [x] Tickets in the queue panel (`SortableQueueItem`) show the same conflict/local-edits indicators
- [x] If any ticket in the current queue has a conflict, the queue panel header shows a warning (e.g. "2 conflicts")
- [x] Conflict badge uses a warning color (amber/orange); local-edits badge uses a neutral informational color
- [x] Hovering/focusing the badge shows a tooltip explaining the state ("Jira version changed since last local edit" / "Has unsaved local changes")

### Active sync check

- [x] When the refinement page mounts, all tickets belonging to the active session are checked for fresh edit state (batch API call or individual re-validation)
- [x] When a ticket is added to the queue, its edit state is re-fetched so the indicator is up-to-date
- [x] The check does not block the page render; indicators update asynchronously once results arrive
- [x] A subtle loading state (e.g. shimmer on the badge area) shows while the check is in progress
- [x] Re-check can be triggered manually via a refresh action on the queue panel

### Edge cases

- [x] Tickets without any local edits (`editState === "clean"`) show no indicator
- [x] If the batch check fails (network error), existing cached state is preserved and no false positives are shown
- [x] Tests cover: conflict badge rendering, local-edits badge rendering, clean state (no badge), async check on mount, check on ticket add

## Technical Notes

- `Ticket.editState` already exists and is computed server-side via `computeTicketEditState` in `src/lib/ticket-state.ts`
- The `/api/tickets` endpoint already returns `editState` per ticket, so the SWR cache from `useTickets` has the data. The "active check" means re-validating this cache for session tickets, not a new endpoint.
- Consider a lightweight hook (e.g. `useConflictCheck`) that takes a list of ticket keys and calls `mutate` on the SWR ticket cache or does a targeted re-fetch for just those keys
- Batch approach: a single `POST /api/tickets/check-edits` endpoint that accepts an array of keys and returns `{ [key]: editState }` would be more efficient than N individual fetches. Alternatively, re-validate the existing `useTickets("__all__")` cache which already includes `editState`.
- Key files to modify:
  - `src/components/refinement-session/TicketRow.tsx` (add conflict/local-edits badge)
  - `src/components/refinement-session/SortableQueueItem.tsx` (add conflict/local-edits badge)
  - `src/components/refinement-session/RefinementQueuePanel.tsx` (queue header warning)
  - `src/components/refinement-session/RefinementPageContent.tsx` (trigger active check on mount + on queue change)
  - New hook or utility for the active check logic

## UI Placement

- **TicketRow / SortableQueueItem:** Small pill/icon to the left of the SP badge, consistent with existing badge patterns (session name pill, subtask count pill)
- **Queue panel header:** Warning text or icon next to the ticket count, only visible when conflicts exist

## Dependencies

- `Ticket.editState` field (exists)
- `computeTicketEditState` (exists in `src/lib/ticket-state.ts`)
- `/api/tickets` returning `editState` (exists)
- BRDG-212 (related but not blocking; this story surfaces existing state, 212 adds the save/push flow to resolve conflicts)
