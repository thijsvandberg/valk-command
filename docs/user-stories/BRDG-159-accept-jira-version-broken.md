# BRDG-159: "Accept Jira version" button does nothing on conflict banner

**Status:** Done
**Priority:** High

## Description

On the ticket detail page, when a conflict is detected (Jira was updated since the last local edit), the conflict banner shows two actions: "Accept Jira version" and "Review diff". Clicking "Accept Jira version" does nothing visually and the conflict state persists.

## Problem

When clicking "Accept Jira version" on the conflict banner (`page.tsx:761`), the `handleDiscardDraft` handler is invoked. This calls `DELETE /api/tickets/{key}/local-edits` and then `mutateTicket()` to refresh the data. However, the conflict does not resolve. Possible causes:

- The DELETE request may be failing silently (errors are only logged to console)
- The SWR `dedupingInterval: 30000` on `useTicketDetail` may prevent the revalidation from actually refetching
- The server-side cache (`cache.invalidate`) may not align with the SWR client-side cache key
- No loading/disabled state on the button, so there is no feedback that the action was attempted

## In Scope

- Investigate and fix why "Accept Jira version" does not resolve the conflict
- Add loading state to the button while the discard operation is in progress
- Ensure the conflict banner disappears after successful resolution
- Add user-facing error feedback if the discard fails

## Out of Scope

- Changes to the "Review diff" flow
- Changes to the DiffViewer's separate "Accept Jira version" button (which may work independently)

## Implementation Plan

1. **Fix root cause: Cache-Control headers** - Change `GET /api/tickets/[key]` response from `max-age=10, stale-while-revalidate=20` to `no-cache` so browser always revalidates after mutations. Server-side LRU cache remains the caching layer.
2. **Optimistic update in handleDiscardDraft** - Pass optimistic data to `mutateTicket()` so the conflict banner disappears instantly (set `editState: "clean"`, clear `localEdits`).
3. **Loading state on banner button** - Add `isDiscarding` state, show spinner + "Accepting..." text, disable button during operation.
4. **Error feedback** - Show inline error in conflict banner area if DELETE fails, instead of console-only logging.
5. **Reset conflict diff state** - Clear `showConflictDiff` and `metadataOnlyConflict` in `handleDiscardDraft` so history tab doesn't show stale diff.
6. **Verify DiffViewer flow** - The `TicketHistory.tsx` accept button uses the same DELETE endpoint; cache fix resolves it too. Apply optimistic update in `onConflictResolved` handler for consistency.
7. **Tests** - Write tests for the conflict banner UI states and the handleDiscardDraft flow.

## Acceptance Criteria

- [x] Clicking "Accept Jira version" on the conflict banner successfully removes all local edits
- [x] The conflict banner disappears after the operation completes
- [x] The ticket content reverts to the Jira version
- [x] A loading indicator is shown while the operation is in progress
- [x] If the operation fails, an error message is shown to the user
- [x] Verify the DiffViewer's accept button (`TicketHistory.tsx:264`) also works correctly

## Technical Notes

Key files:
- `src/app/(app)/tickets/[key]/page.tsx` - `handleDiscardDraft` (line 270) and conflict banner (line 748)
- `src/app/api/tickets/[key]/local-edits/route.ts` - DELETE handler (line 47)
- `src/services/ticket-service.ts` - `deleteLocalEdits` (line 343)
- `src/lib/ticket-state.ts` - `computeTicketEditState` derives "conflict" state
- `src/hooks/useSprintBoard.ts` - `useTicketDetail` SWR hook with 30s dedup interval
