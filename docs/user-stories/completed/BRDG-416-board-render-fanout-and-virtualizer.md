# BRDG-416: Sprint board per-row render fan-out + virtualizer offset (the BRDG-405 remainder)

**Status:** Completed (2026-07-01)
**Priority:** High
**Type:** Performance / Stability — sprint board

## Status (2026-07-01)

**#1 Per-row render fan-out (the headline) — shipped, commit `f75f39a2`.** A render-count
harness (`TicketTable.renderCount.test.tsx`) — BoardRow mocked with a real `memo()` wrapper
plus a per-key render counter — was built first and MEASURED the leaks, exactly as the story
directed. It found two:

1. `makeRowProps` passed the raw `selectedTicket` to **every** row, so a selection change
   re-rendered the whole visible set. Fix: `BoardRow` derives its click toggle from the
   `isSelected` boolean it already receives; `selectedTicket` was dropped from the per-row
   props (kept only as a `makeRowProps` dep for the `isSelected` value) and made optional on
   `BoardRowBaseProps` so other callers compile unchanged.
2. `handleCheckboxClick` depended on `tickets` + `checkedTickets`, so a new identity on every
   check / refetch re-rendered every row. Fix: it now reads both through latest-refs and
   carries a stable identity.

The harness now asserts that selecting / checking / hover-focusing one row re-renders only
that row (and its previously-selected/focused sibling), never the siblings. Verified: lint /
typecheck / `vitest` (7325) / build green; E2E on the running board — rows render, click
selects (URL updates) and re-click deselects via the new `isSelected` path, no console errors.

**#4 Virtualizer offset — shipped, commit `3ab56371`.** The scrollMargin is now measured from
`tableContainerRef.current.offsetTop` in a `useLayoutEffect` into state (re-measured via a
`ResizeObserver` on the scroll container) instead of read during render, so the virtual window
is correctly positioned on first paint even with content above the table. (The React
Compiler's `set-state-in-effect` rule does not fire on a layout-effect measure-into-state, as
confirmed by lint.)

**#5 `<SingleSprintHeader/>` extract — shipped, commit `c48eeef0`.** The ~120-line header
`useMemo` is now a memoised component with raw-input props, so it re-renders exactly when its
inputs change and there is no hand-maintained dependency array to drift out of date. The host
still gates applicability so `flatHeader` stays `undefined` when hidden.

Verified E2E: board renders + virtualizes, the extracted header shows its status pills, and
the (separately split) context menu renders in full — no console errors.

## Description

[[BRDG-405-board-render-performance]] shipped the two High *stability* fixes (render-time
`setRouterPrefetch` → effect; drag-start list snapshot) and the overlay-equality fix, but deferred
the headline **per-row render fan-out** plus two render-purity items. This story is that remainder.
React Compiler is in use, so this is about render purity and prop identity, NOT adding manual memo.

## Current state (what was deferred and the finding)

- **#1 Per-row prop fan-out (High, perf — headline).** The 2026-06-25 re-audit framed this as
  "`makeRowProps` identity changes → every `BoardRow` re-renders". On closer inspection it is more
  nuanced: `BoardRow` is already `memo()` (shallow) and `makeRowProps`
  ([TicketTable.tsx:422](../../src/components/sprint-board/TicketTable.tsx)) already passes
  **individual derived booleans** (`isChecked`/`isSelected`/`isFocused`/`isContextTarget`), not the
  Sets. So for a single-row select/check (with `someChecked` unchanged) the unchanged rows' props are
  shallow-equal and the memo should hold; the genuine board-wide re-renders are `someChecked` crossing
  0↔1 and `isDragActive` toggling, which are legitimate. **The real question is empirical:** which
  interactions actually fan out, and is any map/handler prop (`poStatuses`, `readinessMap`,
  `sprintNameMap`, the various handlers) unstable in identity so it breaks the shallow comparison for
  all rows?
- **#4 Virtualizer ref-in-render (Medium).** `scrollMargin`/`paddingTop`
  ([TicketTable.tsx:402,416](../../src/components/sprint-board/TicketTable.tsx)) read
  `tableContainerRef.current?.offsetTop` during render; first paint reads 0 and never recomputes
  reactively (e.g. when the analytics panel opens above the table) → a one-frame scroll jump /
  mis-positioned virtual window.
- **#5 Oversized memoized header (Low).** A ~100-line `useMemo` returning JSX with ~25 deps in
  `SprintBoard.tsx`; a missed dep silently produces a stale header.

## Proposed approach (and the trade-offs)

1. **Measure before changing (#1).** Build a render-count harness first — mock `BoardRow` with a
   `memo`-wrapped render counter (mirroring the real memo), render `TicketTable` with realistic
   stable props, then toggle one row's checkbox / selection / focus and assert sibling counters did
   not increment. This converts the vague "feels janky" into a precise pass/fail and pinpoints any
   unstable prop. **Trade-off / pitfall:** do NOT apply the audit's suggested "pass the Sets down and
   derive in the row" — handing `BoardRow` the `checkedTickets` Set means a new Set identity on every
   toggle, which breaks its shallow `memo` for *all* rows and makes the fan-out worse. The booleans
   are already the right shape; the fix (if the harness shows a leak) is to stabilise the offending
   reference, not to restructure the prop contract.
2. **Fix what the harness surfaces.** Likely candidates: ensure `poStatuses` / `readinessMap` /
   `sprintNameMap` and the row handlers keep a stable identity across renders (memoize at the source
   in `SprintBoard`/`useTicketActions` if not already), and split off the genuinely board-wide
   booleans (`someChecked`, `isDragActive`) so they are the only thing that legitimately re-renders
   all rows.
3. **Virtualizer offset (#4):** measure `offsetTop` in a `useLayoutEffect` into state (with a
   `ResizeObserver` on the scroll container so content opening above the table re-measures), and feed
   that state to the virtualizer's `scrollMargin` instead of reading the ref in render. **Trade-off:**
   this touches the perf-critical `@tanstack/react-virtual` setup, where a mistake (mis-positioned or
   jumping virtual window) is worse than the current one-frame jump — verify scroll/virtualisation in
   both grouped and flat views.
4. **Extract `<SingleSprintHeader/>` (#5)** and drop the manual `useMemo`. Behaviour-neutral.

## Acceptance Criteria

- [x] Selecting / checking / hover-focusing a single row does not re-render the other visible rows
      (proven by a render-count test or profiler assertion); the only all-row re-renders are the
      legitimate `someChecked` 0↔1 and `isDragActive` transitions.
- [x] The virtual window is correctly positioned on first paint even when content sits above the table
      (analytics panel open), in both grouped and flat views.
- [x] The single-sprint header is a component; no behavioural change.
- [x] No regression in board selection, drag-drop, optimistic edits, or grouped/All views.

## Tests

- [x] Render-count test: toggling one row's checkbox/selection re-renders only that row (and its
      previously-focused/selected sibling), not the whole visible set (`TicketTable.renderCount.test.tsx`).
- [x] Virtualizer test (or visual check): offset is non-zero on first paint when content sits above
      (verified E2E; jsdom has no layout so this is a visual/runtime check, not a unit test).
- [x] Existing `SprintBoard` / `BoardRow` / `TicketTable` / drag-drop / moveMeter tests stay green.

## Open Questions

- **Harness shape:** mock `BoardRow` with a memo'd counter (tests TicketTable's prop stability) vs. a
  full profiler run against the real board. Recommend the mock-counter harness first (deterministic,
  cheap), then a profiler pass to catch SprintBoard-level instabilities the isolation test can't see.

## Related

- [[BRDG-405-board-render-performance]] — shipped the stability fixes; this is its deferred render
  remainder (#1 fan-out, #4 virtualizer offset, #5 header extract).
- [[BRDG-415-finish-board-row-actions-glue-convergence]] — sibling board story; coordinate
  `SprintBoard.tsx` edits (do not run concurrently).
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay this must not disturb.
- Touch points: `TicketTable.tsx`, `SprintBoard.tsx`.
