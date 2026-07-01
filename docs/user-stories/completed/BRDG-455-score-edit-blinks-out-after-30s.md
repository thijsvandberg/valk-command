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
On a confirmed save, revalidate the list in each of the three handlers so a fresh read lands and the self-heal clears the overlay cleanly, before its TTL fires. Safe because the metadata / story-points write reliably invalidates the `/api/tickets` response cache (the `cache` store is a `globalThis` singleton, so cross-route `cache.invalidate` works in dev too), so the refetch returns the new value rather than the pre-write snapshot. This brings the score handlers in line with the Jira-field handlers (status/epic/assignee), which already revalidate on confirm via the row-actions dispatch.

### IMPORTANT follow-up: the first fix was a silent no-op (custom SWR cache provider)
The initial fix used `globalMutate(activeListKey)` (the top-level `mutate` imported from `"swr"`). **It did nothing** — verified live in the browser: after the `PUT`, no `GET /api/tickets` fired and the value still blinked out. Root cause: the app wraps SWR in a **custom cache provider** (`SWRProvider`'s `lruProvider`, BRDG-387). The top-level `swr` `mutate` operates on SWR's *default* cache, so it never reaches the board's hooks. The pre-existing `globalMutate("/api/sprints/used-points")` meter refresh (in these handlers **and** in `SprintBoard.refreshMeter`) was broken the same way.

Corrected fix: revalidate through **provider-bound** mutators — `adapter.mutate()` (the board list's `KeyedMutator`) for the ticket list, and `useSWRConfig().mutate("/api/sprints/used-points")` for the capacity meter. Verified live: the `GET /api/tickets?sprintId=…` now fires ~1.7s after the `PUT`, well within the 30s TTL, so the value persists.

## Checklist
- [x] Revalidate the list on confirmed save in `handleGuestimationChange` (via `adapter.mutate()`)
- [x] Same for `handleBusinessValueChange`
- [x] Same for `handleStoryPointsChange`
- [x] Fix the capacity-meter refresh to use the provider-bound mutate (`useSWRConfig().mutate`) in the handlers and `SprintBoard.refreshMeter`
- [x] Tests: list is revalidated (via `adapter.mutate`) and meter refreshed (via `useSWRConfig().mutate`) on confirmed save (all three), and neither on failure (`useTicketActions.test.ts`); `SprintBoard.moveMeter.test.tsx` now asserts the provider-bound mutate
- [x] Docs: `docs/architecture/optimistic-updates.md` (new section + checklist item, incl. the provider-bound-mutate rule)
- [x] Verified live in the browser (network shows the confirm-triggered refetch)

## Out of scope / non-goals
- No change to the overlay TTL or the `/api/tickets` cache TTL.
- No change to poStatus/readiness handlers (map-rendered, reconciled via `hasPendingEdit`, no server blink).
- No change to the sidebar or Compare-view edit paths.
- Did not audit every other top-level `swr` `mutate` usage in the codebase (only the board score/meter paths this bug touched); a broader sweep is worth a separate story.
