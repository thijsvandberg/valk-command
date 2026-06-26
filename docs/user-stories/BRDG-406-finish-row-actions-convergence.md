# BRDG-406: Finish the row-actions convergence (board adopts the shared module)

**Status:** Not Started
**Priority:** High
**Type:** Structure / Stability — sprint board, multiselect + context menu

## Description

BRDG-374 extracted the row-actions surface (right-click menu + bulk bar + dispatch) into a shared
module so the board, inbox, and epic surfaces could not drift. The 2026-06-25 re-audit
([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md)) found the
extraction is **unfinished on the board itself**: the board consumes only the module's `bulk*` write
primitives and re-implements all the "shared glue" locally. So the no-drift guarantee holds for inbox
+ epic but not the board — the board is a second copy. This story completes the convergence and fixes
the dispatch-layer bugs the re-audit surfaced. The dispatch primitives are correct and well-tested
(no data-loss bug found); this is about removing the duplication and the rough edges.

## Current Behaviour

- **Board re-implements the shared glue (High, structure).** `SprintBoard.tsx` consumes only
  `ra.bulk*` + `ra.moveSprint`/`ra.bulkMoveSprint`/`ra.inflightKeys`
  ([:432-441](../../src/components/sprint-board/SprintBoard.tsx)) and re-implements locally:
  `rowMenu` state ([:219](../../src/components/sprint-board/SprintBoard.tsx)) +
  `handleRowContextMenu` ([:678](../../src/components/sprint-board/SprintBoard.tsx)),
  `quickMovesFor`/`currentSprintIdsFor`/`handleQuickMove` ([:812-832](../../src/components/sprint-board/SprintBoard.tsx)),
  `computeFlagState` ([:842-849](../../src/components/sprint-board/SprintBoard.tsx)), copy
  ([:724](../../src/components/sprint-board/SprintBoard.tsx)), review/generate
  ([:723,835](../../src/components/sprint-board/SprintBoard.tsx)), create-sprint
  ([:196,1167](../../src/components/sprint-board/SprintBoard.tsx)) and refine
  ([:216,726,1199](../../src/components/sprint-board/SprintBoard.tsx)). `useRowActions` already exports
  all of these and even has board-specific affordances (`onMove`, `injectSprint`, `flagSource:"ticket"`)
  the board never passes. The right-click target rule is duplicated identically in both places
  (`useRowActions.ts:316-322` vs `SprintBoard.tsx:678-685`).
- **Unstable `currentSprintName` (High, perf).** [useRowActions.ts:55-62](../../src/components/sprint-board/row-actions/useRowActions.ts):
  the callback depends on the whole `opts` literal (a new object each render), so it is recreated
  every render, which recreates `quickMovesFor`/`currentSprintIdsFor` and defeats their memoization.
  The compiler cannot fix this (dep is a new reference each render).
- **`ticket-action-menu.tsx` (840 lines) (Medium, structure).** Mixes portal positioning
  (`AnchoredMenu`/`CursorMenu`/`Flyout` with its own flip/shift layout effect), five data-fetching
  sub-pickers (3 do their own `useSWR`), and the `TicketActionMenuContent` composer in one file.
- **Bulk label "add" is O(N) (Medium, perf).** [useRowActions.ts:137-148](../../src/components/sprint-board/row-actions/useRowActions.ts):
  each selected key fires its own `/api/tickets/<key>` detail GET to read current labels, then a PUT;
  merged labels are not trimmed/case-normalized (so `"bug"` vs `"Bug "` accumulate).
- **Bulk assignee drops the avatar (Medium).** [useRowActions.ts:131-135](../../src/components/sprint-board/row-actions/useRowActions.ts)
  sends `{issueKey, accountId, name}` while the single-row path
  ([useTicketActions.ts:155-167](../../src/components/sprint-board/useTicketActions.ts)) also sends
  `avatar` → bulk-reassigned rows show initials until the next revalidation.
- **Inbox `flagSource` contradicts its contract (Medium).** inbox `page.tsx:160-162` passes
  `flagSource:"ticket"` (rows are always `flagged:false`), but `adapter.ts:137` and
  `inbox-row-actions.test.tsx:73` say `"mixed"`. Impl/doc/test disagree.
- **Selection never pruned to visible keys (Low).** `SprintBoard.tsx:167`, inbox `page.tsx:89`,
  `EpicChildrenSection.tsx:103`: the selection `Set` is pruned only by explicit toggles/mark-read, so
  after a refresh/filter/move that drops a row, its key lingers → "N selected" over-counts and a bulk
  action can target an off-screen row (vanished keys are filtered by `getTicket` so no crash).
- **Dispatch ordering / cleanup (Low).** `useRowActions.ts:93-98` relies on `Promise.allSettled`
  index order to attribute confirm/revert (correct but undocumented); `bulkSetReadiness`
  (`:115-123`) lacks `try/finally` around `inflightKeys` (stuck spinner if it throws).

## Proposed Approach

1. **Route the board through the hook's glue.** Pass `onMove`/`injectSprint`/`flagSource:"ticket"`,
   then consume `ra.rowMenu`/`ra.handleRowContextMenu`/`ra.computeFlagState`/`ra.quickMovesFor`/
   `ra.currentSprintIdsFor`/`ra.handleQuickMove`/`ra.copySelected`/`ra.openRefine`/`ra.quickCreate`
   and delete the local copies. The board-specific extras (clear side panel on right-click, rich move
   toast, pin+navigate create flow) are expressible through the hook's existing options/callbacks.
2. **Fix `currentSprintName`'s dependency** to `opts.currentSprintName` (ensure consumers pass a
   stable callback).
3. **Split `ticket-action-menu.tsx`** into `row-actions/menu-portals.tsx`,
   `row-actions/sub-panels/*`, and a thin `TicketActionMenuContent` composer. No behaviour change.
4. **Bulk label "add":** read current labels from `adapter.getTicket(k)` where available instead of a
   network GET; at minimum trim + case-insensitively dedupe before the PUT.
5. **Thread `avatar` through** `onUpdateAssignee`/`bulkUpdateAssignee` → `jira.assign`.
6. **Align inbox `flagSource`** to `"mixed"` (matches doc + test; safe superset), or update doc+test
   to `"ticket"` — pick one source of truth.
7. **Prune the selection** to the visible key set on data change (a small effect per host, or in the
   hook if it learns the visible set).
8. Document the `allSettled` order guarantee (or zip into `{key,result}`); wrap `bulkSetReadiness`
   in `try/finally`.

## Acceptance Criteria

- [ ] The board uses the shared module for `rowMenu`/context-menu targeting, flag-state, quick-moves,
      copy, review/generate, refine, and create-sprint — the local re-implementations are gone.
- [ ] A change to any of those behaviours is made in exactly one place and applies to board + inbox +
      epic identically.
- [ ] Quick-move derivations are no longer recomputed every render (`currentSprintName` stable).
- [ ] Bulk label "add" does not fan out one detail GET per key, and does not create case/whitespace
      duplicate labels.
- [ ] Bulk re-assign shows the avatar immediately, matching the single-row path.
- [ ] Inbox flag behaviour, its adapter doc, and its test agree.
- [ ] The selection count matches the visible rows after refresh/filter/move.
- [ ] No regression in board/inbox/epic context-menu, bulk-bar, quick-move, or optimistic behaviour.

## Tests

- [ ] Board context-menu / bulk-bar / quick-move tests pass against the shared module (board no
      longer has its own copies).
- [ ] `currentSprintName` stability: `quickMovesFor` identity is stable across renders that don't
      change the sprint name.
- [ ] Bulk label "add" issues no per-key detail GET (or reads from the adapter) and dedupes labels.
- [ ] Bulk assignee dispatch includes `avatar`.
- [ ] Selection pruning: dropping a visible row removes its key from the selection/count.
- [ ] Existing `useRowActions` / `useTicketActions` / `ticket-action-menu` / inbox tests stay green.

## Open Questions

- **Board-specific extras through the hook.** Confirm `useRowActions`' `onMove`/`injectSprint`/
  callback surface is sufficient for the board's rich move toast and pin+navigate create flow, or
  whether a small addition to the hook's options is the cleaner path. Recommend extending the hook
  options rather than keeping board copies.
- **Where selection-pruning lives.** Per-host effect (simplest now) vs. teach `useRowActions` the
  visible key set (centralizes it). Recommend per-host now; centralize if a 4th surface appears.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Row-actions module convergence).
- [[BRDG-374-extract-shared-row-actions-module]] — the extraction this completes.
- [[BRDG-405-board-render-performance]] — sibling board story; coordinate on `SprintBoard.tsx`.
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay protocol the adapters honour.
- Touch points: `row-actions/useRowActions.ts`, `row-actions/adapter.ts`, `useTicketActions.ts`,
  `ticket-action-menu.tsx`, `SprintBoard.tsx`, inbox `page.tsx`, `EpicChildrenSection.tsx`.
