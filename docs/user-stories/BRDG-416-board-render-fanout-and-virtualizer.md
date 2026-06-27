# BRDG-416: Sprint board per-row render fan-out + virtualizer offset (the BRDG-405 remainder)

**Status:** Not Started
**Priority:** High
**Type:** Performance / Stability — sprint board

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

- [ ] Selecting / checking / hover-focusing a single row does not re-render the other visible rows
      (proven by a render-count test or profiler assertion); the only all-row re-renders are the
      legitimate `someChecked` 0↔1 and `isDragActive` transitions.
- [ ] The virtual window is correctly positioned on first paint even when content sits above the table
      (analytics panel open), in both grouped and flat views.
- [ ] The single-sprint header is a component; no behavioural change.
- [ ] No regression in board selection, drag-drop, optimistic edits, or grouped/All views.

## Tests

- [ ] Render-count test: toggling one row's checkbox/selection re-renders only that row (and its
      previously-focused/selected sibling), not the whole visible set.
- [ ] Virtualizer test (or visual check): offset is non-zero on first paint when content sits above.
- [ ] Existing `SprintBoard` / `BoardRow` / `TicketTable` / drag-drop / moveMeter tests stay green.

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
