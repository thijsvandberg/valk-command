# BRDG-455: Guesstimate / BV / SP score edit blinks out ~30s after entry

**Status:** Done
**Priority:** High
**Type:** Bug

## Description
When the PO enters a guesstimate on a board row, it shows instantly, then disappears after ~30 seconds, and reappears some time later. Reported for the guesstimate field; the business-value and story-points fields share the identical defect. The value is never actually lost — it is persisted to the DB the whole time — this is purely a display gap.

## Root Cause
The three PO-score handlers (`handleGuestimationChange`, `handleBusinessValueChange`, `handleStoryPointsChange` in `src/components/sprint-board/useTicketActions.ts`) ride the `pendingTicketEdits` optimistic overlay:

1. On edit, `registerPendingEdit` shows the value immediately and schedules a 30s TTL self-clear.
2. The save succeeds and `confirmPendingEdit` marks it eligible for hand-off.
3. The overlay's self-heal (`SprintBoard.tsx`) only clears the overlay once the **loaded list** (`apiTickets`) reflects the value.
4. **But the handlers never revalidated the ticket list** — they only refreshed the capacity meter (`/api/sprints/used-points`). So the loaded list was never refetched to include the new score.

On the **All / backlog view** — where forward-planning guesstimates are entered — the board has **no background poll** (`refreshInterval = 0`, `useSprintBoard.ts`). With `revalidateOnFocus: true` but the PO sitting on the page (no window blur), nothing refetched the list. So:

- **t=0**: score visible via overlay; save succeeds; `/api/tickets` cache correctly invalidated.
- **t≈30s**: overlay TTL evicts the value; the stale loaded list still lacks it → **disappears**.
- **later**: a window refocus / navigation (or, on a sprint view, the 60s poll) refetches the list → the persisted value → **reappears**.

## Fix
On a confirmed save, `globalMutate(activeListKey)` in each of the three handlers so a fresh list read lands and the self-heal clears the overlay cleanly, before its TTL fires. Safe because the metadata / story-points write reliably invalidates the `/api/tickets` response cache (the `cache` store is a `globalThis` singleton, so cross-route `cache.invalidate` works in dev too), so the refetch returns the new value rather than the pre-write snapshot. This brings the score handlers in line with the Jira-field handlers (status/epic/assignee), which already revalidate on confirm via the row-actions dispatch.

## Checklist
- [x] Revalidate `activeListKey` on confirmed save in `handleGuestimationChange`
- [x] Same for `handleBusinessValueChange`
- [x] Same for `handleStoryPointsChange`
- [x] Tests: list is revalidated on confirmed save (all three), and not on failure (`useTicketActions.test.ts`)
- [x] Docs: `docs/architecture/optimistic-updates.md` (new section + checklist item)

## Out of scope / non-goals
- No change to the overlay TTL or the `/api/tickets` cache TTL.
- No change to poStatus/readiness handlers (map-rendered, reconciled via `hasPendingEdit`, no server blink).
- No change to the sidebar or Compare-view edit paths.
