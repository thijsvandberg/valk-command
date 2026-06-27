# BRDG-405: Sprint board render performance + drag correctness

**Status:** Partially delivered (two of three High items + the overlay-equality fix shipped; the
per-row render fan-out (#1), virtualizer offset (#4), and header extract (#5) deferred)
**Priority:** High
**Type:** Performance / Stability — sprint board

## Status

Shipped 2026-06-26 — the two High *stability* items plus the overlay-equality fix:

- **#2 Render-time side effect (High):** `setRouterPrefetch((url) => router.prefetch(url))` moved out
  of the component body into a `useEffect` keyed on `router`. No more writing a closure into module
  state on every render. Verified live: the board renders and navigates with no console errors.
- **#3 Drag-end index race (High):** `handleBoardDragStart` now snapshots the operative (visible)
  list into a ref, and the intra-group rank reorder computes `oldIndex`/`overIndex`/`placeAbove`
  against that snapshot rather than the live `tickets` prop. A poll/focus revalidation that shifts
  the list mid-drag can no longer flip the committed rank direction. Tested (a mid-drag list reversal
  still commits the snapshot's direction).
- **#6 Overlay equality (Low):** `valuesMatch` compares the `assignee` (the only object-valued
  overlay field) by its display `name` instead of a key-order-fragile full-object `JSON.stringify`,
  so the assignee overlay self-heals as soon as the server reflects it instead of lingering to its
  30s TTL. Tested (optimistic vs richer server object now match on name).

Verified: full suite green (6898 tests; 2 new + existing valuesMatch/drag tests extended),
lint/typecheck/build clean, board healthy live (renders, no console errors).

### Deferred (with reasons) — remaining work

> Tracked as a dedicated follow-up: [[BRDG-416-board-render-fanout-and-virtualizer]]
> (full trade-offs + approach there).

- **#1 Per-row prop fan-out (High, perf — the headline).** Not done. On inspection the situation is
  more nuanced than "every row always re-renders": `BoardRow` is already `memo()` (shallow) and
  `makeRowProps` already passes **individual derived booleans** (`isChecked`/`isSelected`/`isFocused`/
  `isContextTarget`), not the Sets — so for a single-row select/check (with `someChecked` unchanged)
  the unchanged rows' props are shallow-equal and the memo should hold. The genuine board-wide
  re-renders are `someChecked` crossing 0↔1 and `isDragActive` toggling, which are legitimate. The
  remaining work is to **measure** with a render-count harness and stabilise any unstable map/handler
  prop the profiler surfaces — not to apply the audit's suggested "pass the Sets down", which would
  make it *worse* (a new Set identity each toggle breaks `BoardRow`'s shallow memo for all rows).
  Deferred to be done against a profiler rather than speculatively, and to avoid a risky `BoardRow`
  prop-contract change.
- **#4 Virtualizer ref-in-render (Medium).** Deferred — moving `offsetTop` into a layout-effect-backed
  state touches the perf-critical `@tanstack/react-virtual` setup, where a mistake (mis-positioned or
  jumping virtual window) is worse than the current one-frame jump. Lower risk to land with #1's
  measurement harness in place.
- **#5 Extract `<SingleSprintHeader/>` (Low).** Deferred — a behaviour-neutral mechanical extraction;
  no correctness/perf payload on its own.

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
found the refactored board is correct but leaves render-performance on the table and has one
drag-ordering correctness seam. The headline: a single-row interaction (select, check, hover-focus,
drag) re-renders **every visible row**, which is the main source of felt jank on large sprints. This
story removes the unnecessary re-renders and fixes the related render-purity and drag issues.

React Compiler is in use, so this is about render purity and prop-identity, NOT adding manual
memoization.

## Current Behaviour

- **Per-row prop fan-out (High, perf).** [TicketTable.tsx:422-477](../../src/components/sprint-board/TicketTable.tsx):
  `makeRowProps` is a `useCallback` whose deps include `checkedTickets`, `selectedTicket`,
  `focusedTicketIdx`, `someChecked`, `activeDragId`, `contextMenuKeys`. Each row's prop object is
  built fresh inside `.map`, so when any one of those board-wide values changes, `makeRowProps`
  identity changes and **every** mounted/virtualized `BoardRow` gets a new props object → its `memo`
  bails and all visible rows re-render. The grouped view disables virtualization
  ([:678](../../src/components/sprint-board/TicketTable.tsx)), so there the blast radius is every row
  in every group.
- **Render-time side effect (High, stability).** [SprintBoard.tsx:88](../../src/components/sprint-board/SprintBoard.tsx):
  `setRouterPrefetch((url) => router.prefetch(url))` runs in the component body, writing a new
  closure into module-level state on every render. This is a render-time side effect the compiler
  cannot reason about and that breaks under any double/concurrent render.
- **Drag-end index race (High, stability).** [useSprintBoardDragDrop.ts:260-289](../../src/components/sprint-board/useSprintBoardDragDrop.ts):
  `oldIndex`/`overIndex`/`placeAbove` are derived from the live filtered `tickets` prop (captured by
  the handler closure at drag start), while the optimistic `mutateTickets` reorders the full
  unfiltered cache. If a background revalidation or optimistic edit changes `tickets` mid-drag, the
  committed insert index can be off, landing the row at the wrong rank — silently, no error.
- **Virtualizer ref-in-render (Medium).** [TicketTable.tsx:402,416](../../src/components/sprint-board/TicketTable.tsx):
  `scrollMargin`/`paddingTop` read `tableContainerRef.current?.offsetTop` during render; first paint
  reads 0 and it never recomputes reactively (e.g. when the analytics panel opens above the table) →
  one-frame scroll jump / mis-positioned virtual window.
- **Oversized memoized header (Low).** [SprintBoard.tsx:901-1002](../../src/components/sprint-board/SprintBoard.tsx):
  a ~100-line `useMemo` returning JSX with ~25 deps; a missed dep silently produces a stale header.
- **Type escapes around the overlay (Low).** `pendingTicketEdits.ts:119-126` compares objects via
  `JSON.stringify` (key-order fragile; the assignee overlay can linger up to its 30s TTL);
  `SprintBoard.tsx:296` double-casts `Ticket` to index by an `EditableField` string; `:905-906`
  `activeSprint!` assertions.

## Proposed Approach

1. **Stop the fan-out.** Pass the board-wide state to `BoardRow` as stable references (the
   `checkedTickets`/`contextMenuKeys` Sets, `selectedTicket`, `activeDragId`) and let each row derive
   its own `isChecked`/`isSelected`/`isFocused` from its key, OR split only the identity-sensitive
   per-row props so a single changed row produces a single changed props object. Verify with a render
   count that selecting/checking one row no longer re-renders its siblings.
2. **Move `setRouterPrefetch` into an effect** keyed on `router`.
3. **Snapshot the operative list at drag start** (store it in a ref in `handleBoardDragStart`) and
   compute indices against that snapshot in `handleBoardDragEnd`.
4. **Measure `offsetTop` in a layout effect into state** (or use the virtualizer's scrollMargin
   measurement) instead of reading the ref in render.
5. **Extract `<SingleSprintHeader/>`** and drop the manual `useMemo`.
6. Compare the overlay's `assignee` by its meaningful field instead of full-object stringify;
   constrain `EditableField` to `keyof Ticket` to drop the double-cast; narrow `activeSprint` with a
   local const guard.

No user-facing behaviour change beyond a smoother board and a correct drag-drop rank.

## Acceptance Criteria

- [ ] Selecting / checking / hover-focusing a single row does not re-render the other visible rows.
      _(Deferred — see Status #1; per-row props are already booleans + `BoardRow` is memo'd, so this
      is largely structural already; needs a profiler to confirm/stabilise.)_
- [x] No render-time side effects on the board (`setRouterPrefetch` runs in an effect).
- [x] A drag that completes while the list revalidates lands the row at the intended rank.
- [ ] The virtual window is correctly positioned on first paint even when content sits above the
      table (analytics panel open). _(Deferred — see Status #4.)_
- [ ] The single-sprint header is a component; no behavioural change. _(Deferred — see Status #5.)_
- [x] No regression in board selection, drag-drop, optimistic edits, or grouped/All views.

## Tests

- [ ] Render-count test: toggling one row's checkbox/selection re-renders only that row. _(Deferred with #1.)_
- [x] Drag test: a list mutation between drag-start and drop still commits the correct insert index.
- [x] Existing `SprintBoard` / `BoardRow` / drag-drop / moveMeter tests stay green.
- [x] Overlay equality test: an assignee whose server object differs only in key order clears the
      overlay without waiting for TTL.

## Open Questions

- **Fan-out fix shape.** Derive-in-row (pass Sets + selected key down) vs. split per-row props.
  Recommend derive-in-row: fewer props, each row reads its own membership from a stable Set.
  Confirm `BoardRow`'s `memo` comparator handles Set identity correctly.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Board render performance).
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay this must not disturb.
- [[BRDG-406-finish-row-actions-convergence]] — sibling board story; coordinate on `SprintBoard.tsx` edits.
- Touch points: `TicketTable.tsx`, `SprintBoard.tsx`, `useSprintBoardDragDrop.ts`, `pendingTicketEdits.ts`.
