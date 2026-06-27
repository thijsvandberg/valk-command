# BRDG-406: Finish the row-actions convergence (board adopts the shared module)

**Status:** Partially delivered (correctness/perf/robustness fixes shipped; structural board-glue
convergence + menu-file split + selection-pruning deferred)
**Priority:** High
**Type:** Structure / Stability — sprint board, multiselect + context menu

## Status

Shipped 2026-06-26 — the isolated, lower-risk dispatch-layer fixes:

- **#2 Unstable `currentSprintName` (perf):** the callback now depends on
  `opts.currentSprintName`, not the whole `opts` literal, so `quickMovesFor` /
  `currentSprintIdsFor` keep a stable identity across renders. Tested.
- **#4 Bulk label "add" dupes:** added `mergeLabels` (trim + case-insensitive dedupe, first-seen
  casing). The per-key detail GET is kept deliberately — the list payload omits `labels` (the
  list-vs-detail split), so the adapter cannot supply them and the GET is the authoritative source;
  documented inline. Tested (`"bug"`/`"Bug "` no longer accumulate).
- **#5 Bulk assignee avatar:** threaded `avatar` through `AssigneeSubPanel` → `onUpdateAssignee` →
  `bulkUpdateAssignee` → `jira.assign`, matching the single-row path so bulk-reassigned rows show
  the avatar immediately. Tested.
- **#6 Inbox `flagSource`:** production now passes `"mixed"` (the inbox row does not track real Jira
  flag state), aligning impl + adapter doc + test. Verified live: the inbox menu now offers both
  Flag and Remove flag.
- **#8 Dispatch robustness:** `bulkSetReadiness` wraps its work in `try/finally` so a throw cannot
  leave a key stuck in `inflightKeys` (a permanently spinning pill); documented the `Promise.allSettled`
  index-order guarantee that confirm/revert attribution relies on. Tested.

Verified: full suite green (6896 tests; 7 new), lint/typecheck/build clean, and E2E in Chrome — the
board's right-click menu renders every action (status, assignee, epic, quick-moves, flag, labels)
with no console errors, and the inbox menu shows both flag actions.

### Deferred (with reasons) — remaining work

> Tracked as a dedicated follow-up: [[BRDG-415-finish-board-row-actions-glue-convergence]]
> (full trade-offs + approach there).

- **#1 Route the board through the hook's glue (the headline).** Not done. The board's
  `rowMenu`/`handleRowContextMenu`, `quickMovesFor`/`currentSprintIdsFor`/`handleQuickMove`,
  `computeFlagState`, copy, refine and create-sprint are still local copies. Converging them safely
  needs hook extensions for board-specific behaviour the hook does not yet model: the right-click
  side-panel clear, the rich move toast + capacity-meter refresh (partly covered by the existing
  `onMove` option), `handleRankToEdge` (move-to-top/bottom, not in the hook at all), and the
  **pin+navigate** create-sprint flow (the hook's `confirmQuickCreate` does `injectSprint` + move,
  which is different). This is a large, high-regression-risk refactor of a 1254-line component that
  the sibling **BRDG-405** also edits; deferred to avoid destabilising that file mid-sprint. The
  no-drift guarantee already holds for the bulk write primitives + move + flag (all routed through
  the hook); the remaining gap is the menu/quick-move/create glue.
- **#3 Split `ticket-action-menu.tsx` (840 lines).** Deferred — a large mechanical, behaviour-neutral
  restructure (Medium priority); higher value to land #1's hook extensions first so the split lines
  up with the converged surface.
- **#7 Selection pruning.** Deferred — Low severity (no crash; vanished keys are filtered by
  `getTicket`, only the "N selected" count drifts), and the only React-Compiler-legal implementation
  is an adjust-state-during-render prune in each host, which adds render-time `setState` to
  `SprintBoard.tsx` right before BRDG-405's render-performance work. Better landed alongside that.

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
      _(Deferred — see Status #1.)_
- [ ] A change to any of those behaviours is made in exactly one place and applies to board + inbox +
      epic identically. _(Holds for the bulk write/move/flag primitives; the board's menu/quick-move/
      create glue is still a second copy — deferred.)_
- [x] Quick-move derivations are no longer recomputed every render (`currentSprintName` stable).
- [x] Bulk label "add" does not fan out one detail GET per key, and does not create case/whitespace
      duplicate labels. _(Dedupe done; the GET is kept by necessity — the list omits labels — and
      documented.)_
- [x] Bulk re-assign shows the avatar immediately, matching the single-row path.
- [x] Inbox flag behaviour, its adapter doc, and its test agree.
- [ ] The selection count matches the visible rows after refresh/filter/move. _(Deferred — see Status #7.)_
- [x] No regression in board/inbox/epic context-menu, bulk-bar, quick-move, or optimistic behaviour.

## Tests

- [ ] Board context-menu / bulk-bar / quick-move tests pass against the shared module (board no
      longer has its own copies). _(Deferred with #1; board copies remain.)_
- [x] `currentSprintName` stability: `quickMovesFor` identity is stable across renders that don't
      change the sprint name.
- [x] Bulk label "add" issues no per-key detail GET (or reads from the adapter) and dedupes labels.
      _(GET kept by necessity; dedupe tested.)_
- [x] Bulk assignee dispatch includes `avatar`.
- [ ] Selection pruning: dropping a visible row removes its key from the selection/count. _(Deferred.)_
- [x] Existing `useRowActions` / `useTicketActions` / `ticket-action-menu` / inbox tests stay green.

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
