# BRDG-415: Finish the board's row-actions glue convergence (the BRDG-406 remainder)

**Status:** Completed (2026-07-01)
**Priority:** High
**Type:** Structure / Stability — sprint board, multiselect + context menu

## Status (2026-07-01)

The behavioural deliverables shipped on `dev`:

- **Glue convergence (the headline).** The board no longer re-implements the context-menu
  state, quick-moves, flag-state, copy, refine or quick-create glue — it consumes them from
  `useRowActions` and the local copies are gone. Two small host hooks were added to the
  shared module so the board's two divergences map cleanly onto it: `onContextMenuOpen` (the
  board clears its side panel on right-click) and `onConfirmQuickCreate` (the board pins +
  navigates instead of injecting a sprint into a cache). The rich move toast + capacity-meter
  refresh ride the existing `onMove` option, reached via a latest-ref to break the
  `handleBulkMoveSprint` ↔ `ra` cycle. `handleRankToEdge` stays board-local. Commit `37a8744a`.
- **Selection pruning (board + inbox + epic).** A shared, tested `pruneSelectionToVisible`
  drops selection keys no longer visible after a refetch / filter / move, applied per host
  during render (identity-guarded so it never loops). Commit `f6fc9a5e`.

Verified: `npm run lint` / `typecheck` / `vitest` (7321 tests) / `build` all green; E2E on
the running board — it renders, right-click fires the converged context menu (quick-moves +
flag from the shared glue), no console errors.

- **Menu split (`ticket-action-menu.tsx`).** The 785-line file is split into
  `ticket-action-menu-portals.tsx` (AnchoredMenu / CursorMenu / Flyout / QUICK_MOVE_ICON),
  `ticket-action-menu-sub-panels.tsx` (the five data-fetching pickers), and the composer
  (`TicketActionMenuContent`) which stays in `ticket-action-menu.tsx` and re-exports
  AnchoredMenu / CursorMenu / MenuItem so every consumer is unchanged. Code was moved
  byte-exact (via `sed`, not retyped) so it is behaviour-neutral; verified E2E — the
  right-click menu renders its full structure (quick-moves, Update/Assist flyouts, sub-panels)
  with no console errors. Commit `d3f2c097`.

## Description

[[BRDG-406-finish-row-actions-convergence]] shipped the isolated dispatch-layer fixes (stable
`currentSprintName`, label dedupe, bulk-assignee avatar, inbox `flagSource`, `bulkSetReadiness`
robustness) but deliberately deferred the **structural** convergence — it is a large, high-regression
refactor of the 1254-line `SprintBoard.tsx`, which BRDG-405 also edited, so doing it mid-sprint was
too risky. This story is that remainder: the board still re-implements the row-actions glue that
`useRowActions` already exports, so the "can't drift" guarantee holds for the bulk write/move/flag
primitives but NOT for the menu/quick-move/create-sprint glue (the board is a second copy).

## Current state (what is still duplicated)

`SprintBoard.tsx` consumes the hook's `ra.bulk*` + `ra.bulkMoveSprint` + `ra.bulkSetFlagged`, but
re-implements locally:

- `rowMenu` state + `handleRowContextMenu` (vs `useRowActions.ts`'s identical pair) — the board's
  version additionally **clears the side panel** on right-click.
- `quickMovesFor` / `currentSprintIdsFor` / `handleQuickMove` (vs the hook's identical trio) — the
  board's `handleQuickMove` create-name branch opens the board's own **pin + navigate** create flow.
- `computeFlagState`, `copySelected` (board's `handleCopyToClipboard`), `openRefine` — all duplicated.
- `handleRankToEdge` (move-to-top / move-to-bottom of the sprint) — board-only, **not in the hook at
  all**.
- the rich move toast + capacity-meter refresh (`handleBulkMoveSprint`) — board-only, but the hook
  already has the `onMove` option to receive it.

The right-click target rule is duplicated identically (`useRowActions.ts:316-322` vs
`SprintBoard.tsx`'s `handleRowContextMenu`).

Also still open from BRDG-406:

- **`ticket-action-menu.tsx` (840 lines)** mixes portal positioning, five data-fetching sub-pickers,
  and the composer in one file.
- **Selection is never pruned to the visible key set** (`SprintBoard.tsx`, inbox `page.tsx`,
  `EpicChildrenSection.tsx`): after a refresh/filter/move drops a row its key lingers, so the
  "N selected" count over-counts and a bulk action can target an off-screen row (vanished keys are
  filtered by `getTicket`, so no crash — only count drift).

## Proposed approach (and the trade-offs)

1. **Extend `useRowActions` options rather than keep board copies** (the BRDG-406 Open Question's
   recommended path). The board-specific behaviours that block a naive swap map cleanly onto small,
   optional hook callbacks:
   - side-panel clear → add `onContextMenuOpen?(key)` and call it inside the hook's
     `handleRowContextMenu` before `setRowMenu`.
   - rich move toast + meter → already expressible via the existing `onMove` option (pass
     `handleBulkMoveSprint`); `ra.handleQuickMove` then routes through it automatically.
   - pin + navigate create → add an `onConfirmQuickCreate?(sprint, keys)` override; when present the
     hook calls it instead of its default `injectSprint` + `move`.
   - `handleRankToEdge` (move-to-top/bottom) stays board-local (it is a board-only affordance with no
     inbox/epic analogue); the menu keeps wiring it from the board.
2. **Then route the board through the hook**: consume `ra.rowMenu` / `ra.setRowMenu` /
   `ra.handleRowContextMenu` / `ra.computeFlagState` / `ra.quickMovesFor` / `ra.currentSprintIdsFor` /
   `ra.handleQuickMove` / `ra.copySelected` / `ra.openRefine` / `ra.quickCreate` /
   `ra.confirmQuickCreate`, and delete the local copies. `rowMenuEpic` re-derives from `ra.rowMenu`.
3. **Split `ticket-action-menu.tsx`** into `row-actions/menu-portals.tsx`, `row-actions/sub-panels/*`,
   and a thin `TicketActionMenuContent` composer — **after** step 2, so the split lines up with the
   converged surface. Behaviour-neutral.
4. **Prune the selection** to the visible key set per host. Because the React Compiler makes
   setState-in-effect build-blocking, implement it as an adjust-state-during-render prune in each host
   (board / inbox / epic), or teach `useRowActions` the visible key set (centralizes it; recommended
   only if a 4th surface appears).

### Why this is High-risk and how to de-risk it

- It is a heavy edit of a 1254-line component woven into the render (CursorMenu, BulkActionBar,
  CreateSprintModal). A subtle regression in context-menu targeting, the move toast, or the create
  flow would be silent. **Guardrails:** land it behind the full test suite plus a render-count /
  context-menu integration test, and verify board + inbox + epic menus E2E. Do it when no sibling
  story is concurrently editing `SprintBoard.tsx` (it collided with BRDG-405).
- The selection-pruning render-time `setState` adds board re-render logic; sequence it after, or
  alongside, BRDG-416's render-fan-out work so the two render-perf changes are reasoned about together.

## Acceptance Criteria

- [x] The board uses the shared module for `rowMenu`/context-menu targeting, flag-state, quick-moves,
      copy, refine, and create-sprint — the local re-implementations are gone (board-only
      `handleRankToEdge` may remain, wired from the board).
- [x] A change to any converged behaviour is made in exactly one place and applies to board + inbox +
      epic identically.
- [x] `ticket-action-menu.tsx` is split into portals / sub-panels / composer with no behaviour change.
- [x] The selection count matches the visible rows after a refresh / filter / move on board, inbox,
      and epic.
- [x] No regression in board/inbox/epic context-menu, bulk-bar, quick-move, rich move toast,
      pin+navigate create, or optimistic behaviour.

## Tests

- [x] Board context-menu / bulk-bar / quick-move tests run against the shared module (board no longer
      has its own copies).
- [x] Create-sprint via quick-move still pins + navigates on the board, and still injects + moves on
      inbox/epic (the `onConfirmQuickCreate` override path) — covered by the `useRowActions` host-hook
      tests; board pin+navigate verified E2E.
- [x] Selection-pruning test per host: dropping a visible row removes its key from the count/targets
      (`prune-selection.test.ts`).
- [x] Existing `useRowActions` / `ticket-action-menu` / inbox / epic tests stay green.

## Open Questions

- **Selection-pruning home:** per-host adjust-state-during-render (simplest now) vs. teaching
  `useRowActions` the visible set. Recommend per-host until a 4th surface appears.

## Related

- [[BRDG-406-finish-row-actions-convergence]] — shipped the dispatch-layer fixes; this is its deferred
  structural remainder (#1 glue, #3 menu split, #7 selection pruning).
- [[BRDG-374-extract-shared-row-actions-module]] — the original extraction.
- [[BRDG-416-board-render-fanout-and-virtualizer]] — sibling board story; coordinate `SprintBoard.tsx`
  edits (do not run concurrently).
- Touch points: `row-actions/useRowActions.ts`, `ticket-action-menu.tsx`, `SprintBoard.tsx`,
  inbox `page.tsx`, `EpicChildrenSection.tsx`.
