# BRDG-271: Moved tickets should jump to the new sprint on the board immediately

**Status:** Not Started
**Priority:** Medium
**Type:** Bug

## Description

As a PO, when I select tickets and use the bulk **Move to sprint** action, I expect them
to immediately relocate to their new sprint on the Sprint Board. Today they stay where
they were: the move succeeds in Jira and the local DB, but the board keeps showing the
tickets in their old sprint until a manual refresh or after a stale-cache timeout.

The toast confirms the move ("Moved 2 tickets to BT: 140 - View on sprint board"), but
clicking through to the board (or staying in the All view) still shows the old grouping.

## Root cause

The Sprint Board reads ticket lists through SWR keys (`/api/tickets` for All view,
`/api/tickets?sprintId=<id>` per sprint), backed by a server-side in-memory cache
(`src/lib/cache.ts`).

The move route (`src/app/api/jira/move-sprint/route.ts`) updates Jira + the DB, then calls
`cache.invalidate("/api/tickets")`. In Next dev, route handlers are bundled as separate
modules, so the move route and the tickets route each hold their **own** cache instance.
The invalidate call never reaches the tickets route's cache, so the follow-up
`mutateTickets()` revalidation gets the **old cached data** back. The tickets therefore
stay in their old sprint.

This is the known issue recorded in the project notes:
*"Cross-route cache.invalidate is unreliable in next dev; patch SWR client-side."*

## Approach

Patch the SWR cache client-side instead of relying on server-side invalidation, mirroring
the drag-and-drop pattern already used in the Compare Sprints view
(`MultiSprintView.tsx`), which updates the source and destination SWR caches directly
(`{ revalidate: false }`) and works instantly.

In `useTicketActions.handleBulkMoveSprint` (`src/components/sprint-board/useTicketActions.ts`):
- After a successful move, update the **current list** cache without a refetch:
  - In a per-sprint view: remove the moved tickets from the active list.
  - In the All view (`/api/tickets`): update the moved tickets' `sprintId` in place so
    their grouping/sprint chip is correct.
- Inject the moved tickets (with the new `sprintId`) into the **destination sprint's**
  SWR cache (`/api/tickets?sprintId=<targetSprintId>`, or the backlog key) via the global
  `mutate`, so they are already present when the user clicks "View on sprint board".
- Avoid duplicates if the destination cache already holds some of the keys.

## Implementation Plan

1. **Add `globalMutate` import** to `src/components/sprint-board/useTicketActions.ts`:
   `import { mutate as globalMutate } from "swr";` (same pattern as `sprint-board-utils.ts`).
2. **Rewrite `handleBulkMoveSprint`** to patch caches client-side after a successful move:
   - `isBacklog = targetSprintId === "__backlog__"`; `newSprintId = isBacklog ? undefined : targetSprintId`
     (matches the route's `t.sprintName || undefined`).
   - `destKey = "/api/tickets?sprintId=" + encodeURIComponent(targetSprintId)` (backlog → `?sprintId=__backlog__`).
   - Snapshot moved tickets from `apiTickets` with their new `sprintId`.
   - Current-list update via `mutateTickets(..., { revalidate: false })`:
     - All view (`activeListKey === "/api/tickets"`): rewrite `sprintId` in place (keep rows).
     - Per-sprint / backlog source view: remove the moved rows.
     - Skip the source removal when `activeListKey === destKey`.
   - Inject into the destination key via `globalMutate(destKey, updater, { revalidate: false })`,
     de-duplicated by key; skip when `destKey === activeListKey`.
   - Cache writes happen **after** `await jira.moveSprint(...)` resolves, so the failure path needs
     no rollback (no optimistic state written).
   - Update deps to `[apiTickets, mutateTickets, activeListKey]`.
3. **Failure path** keeps returning `{ ok: false }`; the existing `SprintBoard` wrapper shows the error toast.
   Do not call bare `mutateTickets()` (the original stale-data bug).
4. **Tests** in `useTicketActions.test.ts`: mock `swr` (`globalMutate`) and `jira.moveSprint`; cover
   per-sprint source removal + destination injection, All-view in-place sprintId update, backlog move,
   no-duplicate injection, and failure (no optimistic writes).

Notes: `sprintDisplayName` on injected tickets stays stale but is cosmetically harmless (group labels
resolve from `sprintNameMap`/sprint id); next revalidation corrects it. Seeding an unfetched destination
key with only the moved tickets is acceptable (`revalidate: false`); SWR fetches the full list on mount.

## Requirements

### 1. Instant relocation after bulk move
- After Move to sprint succeeds, the moved tickets immediately leave their old sprint and
  appear in the target sprint on the board, with no manual refresh.
- The All view immediately reflects the new sprint grouping / sprint chip.

### 2. "View on sprint board" shows them in place
- Following the toast link to the destination sprint shows the moved tickets already in
  that sprint, not after a delay.

### 3. Backlog move works the same way
- Moving to backlog (`__backlog__`) relocates the tickets to the backlog view instantly.

### 4. No regressions on failure
- If the move fails, the optimistic UI is not applied (or is rolled back) and the existing
  "Failed to move tickets to sprint" feedback still shows.

## Out of scope
- Reworking the server-side cache into a cross-module singleton (a separate, broader
  change to `src/lib/cache.ts`). Noted as an alternative root-cause fix but not pursued
  here per the project's documented "patch SWR client-side" guidance.
- The Compare Sprints drag-drop flow, which already updates instantly.

## Technical notes
- Destination key: `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`; backlog
  uses the `__backlog__` sprintId. The ticket's local `sprintId` maps to the DB
  `sprintName` column (set to the numeric sprint id, or `""` for backlog).
- `sprintDisplayName` on injected tickets is best-effort; the board resolves sprint names
  from the sprint list, so a correct `sprintId` is what drives the grouping.
- `useTicketActions` already receives `apiTickets`, `mutateTickets`, and `activeListKey`,
  which is enough to know the current view and build the moved-ticket objects.

## Checklist
- [x] Current-list SWR cache updated client-side after a successful bulk move (per-sprint: remove; All view: update sprintId)
- [x] Moved tickets injected into the destination sprint's SWR cache (no duplicates)
- [x] Backlog moves relocate tickets to the backlog view instantly
- [x] Failure path does not leave stale optimistic state and still surfaces the error toast
- [x] Tests: bulk move updates source + destination caches, All-view sprint update, backlog move, and failure rollback
