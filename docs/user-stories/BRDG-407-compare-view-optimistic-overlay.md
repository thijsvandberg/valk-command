# BRDG-407: Compare view adopts the optimistic-edit overlay (stop snap-back)

**Status:** Not Started
**Priority:** Medium
**Type:** Stability — sprint board (Compare / MultiSprintView)

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

- [ ] An edit (title, status, issue type, readiness, PO status) in the Compare view persists through a
      background revalidation / window refocus — it does not snap back.
- [ ] A move in the Compare view is not reverted by a concurrent refetch before the server confirms.
- [ ] The Compare view no longer maintains its own optimistic-state maps that duplicate
      `pendingTicketEdits` (or, if the minimal fix is taken, the maps are `hasPendingEdit`-guarded).
- [ ] No regression in the two-column Compare layout or its existing behaviour.

## Tests

- [ ] A Compare-view edit followed by a simulated revalidation keeps the edited value.
- [ ] A Compare-view move followed by a simulated refetch keeps the moved state until server confirm,
      and reverts correctly on failure.
- [ ] Existing `MultiSprintView` tests stay green.

## Open Questions

- **Adapter vs. minimal guard.** Full migration onto a Compare `RowActionsAdapter` (removes the
  duplication, more work) vs. guarding the existing maps with `hasPendingEdit` (smaller, leaves the
  copy). Recommend the adapter unless effort is constrained.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Compare view).
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay protocol to adopt.
- [[BRDG-406-finish-row-actions-convergence]] — same "adopt the shared pattern" theme on the board.
- Touch points: `MultiSprintView.tsx`, `pendingTicketEdits.ts`, `row-actions/adapter.ts`.
