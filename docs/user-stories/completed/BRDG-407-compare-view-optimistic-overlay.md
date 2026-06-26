# BRDG-407: Compare view adopts the optimistic-edit overlay (stop snap-back)

**Status:** Completed
**Priority:** Medium
**Type:** Stability — sprint board (Compare / MultiSprintView)

## Status

Shipped 2026-06-26. Isolated to `MultiSprintView.tsx`.

- **Field edits migrated to the shared `pendingTicketEdits` overlay.** `title`, `jiraStatus`,
  `type`, `storyPoints` and `businessValue` now `registerPendingEdit` → API → `confirmPendingEdit`
  /`clearPendingEdit`, and the lists render through `applyPendingEdits`. The old per-handler
  `mutate(..., { revalidate:false })` patches (which survived exactly one revalidation) are gone.
  `saveStoryPoints`/`saveTicketMetadata` are now called with `{ patchList:false }` (BRDG-383). A
  self-heal effect clears confirmed edits once the server reflects them (gated on `confirmed`, like
  the board), skipping tickets currently held by a move override so it cannot reveal a stale snapshot.
- **Moves no longer drop the override before the server has propagated.** The within-column reorder
  and cross-column move keep their column override and clear it after `MOVE_OVERRIDE_TTL_MS` (30s, a
  ref-tracked timer cleared on unmount) instead of immediately, so a concurrent 60s poll / focus
  revalidation (or the ~30s `/api/tickets` response cache) cannot revert the move mid-flight.
- **`readiness` / `poStatus` kept as local maps** — they are never reconciled from a server read in
  this view (no `syncFromApiTickets`), so they already persist and do not snap back; `poStatus` here
  has no server-persist path, so the overlay (with its TTL) would be wrong for it. Not a duplicate of
  the overlay's purpose.

Chose a focused overlay migration over a full `RowActionsAdapter` (Open Question): it deletes the
divergent field-edit copies — the actual snap-back source — without rebuilding the column components.

Verified: full suite green (6889 tests; 4 new MultiSprintView tests), lint/typecheck/build clean, and
E2E in Chrome — the Compare view renders with the two-column layout intact, a `businessValue` edit
(safe, local PO metadata) held through a focus-triggered revalidation (no snap-back), and no console
errors. Status/title/type are real Jira writes so were not mutated on live production tickets; their
no-snap-back is covered by the unit tests, which model the exact stale-revalidation scenario.

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
found that `MultiSprintView` (the multi-sprint Compare view) still carries the "edit snaps back after
a revalidation" bug that the optimistic-edit overlay was built to prevent everywhere else. It is a
divergent second copy of edit logic that now lives correctly in `useTicketActions`/`useRowActions` +
the `pendingTicketEdits` overlay. This story migrates the Compare view onto the shared overlay so
edits made there stay put.

## Current Behaviour

[MultiSprintView.tsx:79-89,131-199,227-364](../../src/components/sprint-board/MultiSprintView.tsx):

- `handleTitleChange` / `handleJiraStatusChange` / `handleIssueTypeChange` patch the SWR cache once
  with `revalidate:false` and then rely on plain `useState` maps (`readinessMap`, `poStatuses`,
  `leftOverride`/`rightOverride`) with **no `hasPendingEdit` guard**. This is exactly the pattern the
  architecture doc ([optimistic-updates.md](../architecture/optimistic-updates.md), the "survives one
  revalidation then snaps back" section) calls the most common board bug: any independent poll / focus
  refetch reconciles the row back to the server value, so the user's edit visibly reverts.
- The drag-commit path drops `leftOverride`/`rightOverride` (`setLeftOverride(null)`) immediately
  after a `revalidate:false` mutate, so a concurrent refetch can still race the move.

## Proposed Approach

Migrate the Compare view to the shared optimistic overlay rather than its bespoke local maps:

1. Build a Compare-view `RowActionsAdapter` (or reuse the board adapter scoped to the two columns) so
   edits go through `pendingTicketEdits` with the standard begin/confirm/revert + self-heal protocol.
2. Replace `readinessMap`/`poStatuses`/`leftOverride`/`rightOverride` with the overlay's
   `hasPendingEdit`-guarded reads, so a revalidation cannot reconcile a pending edit back.
3. Keep the two-column layout and any Compare-specific affordances; only the edit/persistence
   mechanics change.

If a full adapter migration is too large, the minimal viable fix is to guard the existing maps with
`hasPendingEdit` and stop dropping the overrides before the server confirms — but the adapter route
is preferred because it deletes the divergent copy.

## Acceptance Criteria

- [x] An edit (title, status, issue type, readiness, PO status) in the Compare view persists through a
      background revalidation / window refocus — it does not snap back.
- [x] A move in the Compare view is not reverted by a concurrent refetch before the server confirms.
- [x] The Compare view no longer maintains its own optimistic-state maps that duplicate
      `pendingTicketEdits` (or, if the minimal fix is taken, the maps are `hasPendingEdit`-guarded).
- [x] No regression in the two-column Compare layout or its existing behaviour.

## Tests

- [x] A Compare-view edit followed by a simulated revalidation keeps the edited value.
- [x] A Compare-view move followed by a simulated refetch keeps the moved state until server confirm,
      and reverts correctly on failure.
- [x] Existing `MultiSprintView` tests stay green.

## Open Questions

- **Adapter vs. minimal guard.** Full migration onto a Compare `RowActionsAdapter` (removes the
  duplication, more work) vs. guarding the existing maps with `hasPendingEdit` (smaller, leaves the
  copy). Recommend the adapter unless effort is constrained.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Compare view).
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay protocol to adopt.
- [[BRDG-406-finish-row-actions-convergence]] — same "adopt the shared pattern" theme on the board.
- Touch points: `MultiSprintView.tsx`, `pendingTicketEdits.ts`, `row-actions/adapter.ts`.
