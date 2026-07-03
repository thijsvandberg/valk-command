# BRDG-452: Virtualize the grouped / All view of the sprint board

**Status:** Done (2026-07-03)
**Priority:** High
**Type:** Refactor (performance)

## Description

The sprint board's **All view** (and any grouped view) renders every ticket of every
sprint at once. Measured live on the real board: **~2800 rows across 46 sprint groups**
mounted simultaneously. That makes the whole view heavy — render, scroll, memory — and it
was the root of the "drag & drop won't even start" bug: every row is a drag droppable, so
dnd-kit measured ~2800 rects continuously.

The acute drag-start problem is already fixed (commit `a6582bb2`: the grouped view now
measures droppables `WhileDragging` instead of `Always`, so a drag starts). This story is the
deeper fix: **virtualize the grouped view so only the ~visible rows mount**, cutting the
droppable count and making render / scroll / drag light throughout — not just startable.

## Current Behaviour

- `TicketTable` virtualizes **only the flat (single-sprint) path**: `enableVirtualization =
  tickets.length > VIRTUALIZE_THRESHOLD (40) && !flatComposerActive`, and `useVirtualizer`
  windows over `tickets`; the flat render picks `virtualizedTable` when enabled.
  <!-- src/components/sprint-board/TicketTable.tsx (enableVirtualization, rowVirtualizer, virtualizedTable) -->
- The **grouped path is NOT virtualized**: `isGrouped = groups.length > 0` renders
  `groupedTable`, which `groups.map(...)`s every group into an elevated card and, inside each,
  maps **every** `visibleGroupTickets` row to a `SortableBoardRow`/`BoardRow`. Nothing is
  windowed, so all rows across all groups are in the DOM.
  <!-- src/components/sprint-board/TicketTable.tsx (isGrouped, groupedTable, ticketRows) -->
- Each group card is heterogeneous: a `GroupStatBar` header (collapse, sync, create,
  per-group status filter), then the row table, an optional "Finished work" divider
  (`trailingDoneDepStart`), forward-planning placeholder rows, and a group drop-zone for empty
  sprints. Groups collapse/expand via `collapsedGroups`.
  <!-- GroupStatBar per group; FinishedWorkDividerRow; group-zone droppable -->
- `groups` come from `useGroupBy(tickets, sprints, ...)`.
  <!-- src/components/sprint-board/useGroupBy.ts -->
- DnD: in the grouped All view every row is a `SortableBoardRow` (a dnd-kit sortable +
  droppable); cross-sprint moves work by dropping a row on a row in another group, or on a
  `group-zone:` (empty sprint) / `sprint-slot:` tile. The board wraps content in one
  `DndContext` whose droppable measuring strategy is now
  `dndMeasuringStrategy = groups.length > 0 ? WhileDragging : Always`.
  <!-- src/components/sprint-board/SprintBoard.tsx (dndMeasuringStrategy); useSprintBoardDragDrop.ts -->
- The virtualizer already accounts for content above the table via a `useLayoutEffect` +
  `ResizeObserver` scrollMargin measurement (BRDG-416), and rows are shallow-`memo`'d
  `BoardRow`s fed individual boolean props (BRDG-416) — both must be preserved.

## Proposed Approach

Window the grouped view the same way the flat view is already windowed, but over a **single
flattened list of typed items** rather than a homogeneous ticket array:

1. **Flatten groups → an item model.** Build one array of discriminated items in group order:
   `{ type: "group-header", groupKey }`, `{ type: "row", ticketKey, groupKey, flatIdx }`,
   `{ type: "divider", groupKey }`, `{ type: "placeholder", ... }`, `{ type: "group-zone",
   groupKey }`. A collapsed group contributes only its header (+ zone if applicable). This
   makes the interleaved header/row/divider structure a flat, windowable sequence.
2. **Virtualize that item list** with the existing `@tanstack/react-virtual` setup
   (`measureElement` for dynamic heights, since headers, rows, dividers and placeholders differ
   in height), reusing the same external `scrollContainerRef` + BRDG-416 scrollMargin
   measurement. Render only the visible window; keep the per-group elevated-card visual
   (headers stay attached to their group's rows — the card chrome may need to be reconstructed
   per visible run of a group, or the header rendered as a sticky/virtual item).
3. **Preserve grouped DnD.** Only mounted rows are droppables — that is the point (fewer
   droppables). Cross-sprint drop onto a row in an off-screen group must still work: rely on
   `sprint-slot:` / `group-zone:` drop targets and dnd-kit auto-scroll (rows mount as you
   scroll during the drag). Once rows mount/unmount on scroll during a drag, **revisit
   `dndMeasuringStrategy`**: the grouped view likely wants `Always` again (like the flat
   virtualized path per BRDG-347) so scroll-mounted rows get measured mid-drag — this is why
   the flat path uses `Always`. Confirm empirically after virtualizing.
4. **Preserve everything else:** collapse/expand, per-group `GroupStatBar` (filter, sync,
   create, capacity), the "Finished work" divider, placeholders, the empty-group states, the
   BRDG-405/416 render-fan-out fix (individual boolean props, stable handler identities), and
   the pending-edits / pending-moves overlay.

**Non-goals / out of scope:** the flat single-sprint virtualization (already done); changing
grouping logic (`useGroupBy`); changing DnD semantics (cross-sprint move rules stay).

## Open Questions

- **Scope: only the All/sprint grouping, or every grouped view?** The perf problem is
  grouping-agnostic (it's about total mounted rows), and grouping by epic can be just as large.
  **Recommended default: virtualize any grouped view** (the flattened-item model is
  grouping-agnostic), not a sprint-only special case.
- **Full windowing vs a lighter mitigation.** True windowed virtualization of a grouped list
  with interleaved headers is the robust fix but non-trivial. Cheaper alternatives exist:
  (a) collapse all groups by default in the All view (only headers render until expanded), or
  (b) cap rendered rows per group with a "show more". **Recommended default: full
  virtualization** (keeps the view fully usable without extra clicks); fall back to (a) as a
  quick interim only if virtualization proves too risky to land safely.
- **Threshold.** Virtualize the grouped view always, or only past a row count (like the flat
  view's 40)? **Recommended default: only when the total mounted row count would exceed a
  threshold** (small boards render plainly, avoiding virtualization overhead + measurement
  complexity for the common few-sprint case).

## Implementation Plan

Full plan (rationale, risk register, verified current state):
[docs/plans/2026-07-03-brdg-452-grouped-virtualization-dnd.md](../plans/2026-07-03-brdg-452-grouped-virtualization-dnd.md).

Decision (PO-approved 2026-07-03): window rows **inside each group card** (one virtualizer
per expanded group) instead of the flattened single-list sketch above — zero card-chrome
reconstruction, reuses the proven flat-path pattern (BRDG-347/416). Epic grouping gets the
same windowing; the DnD gate stays sprint-grouping-only.

1. Kill the O(n²) `tickets.findIndex` per grouped row: `flatIdxByKey` map in `TicketTable.tsx`.
2. New `VirtualizedGroupRows.tsx`: per-group `useVirtualizer` over `{row|divider}` items,
   spacer `<tr>`s, `measureElement`, shared scrollMargin hook extracted from the BRDG-416
   flat-path block. Composer/placeholders/group-zone stay as real DOM outside the window.
3. Gate in `TicketTable.tsx`: window every expanded group when total expanded rows > 100
   (`GROUPED_VIRTUALIZE_THRESHOLD`). No composer opt-out was needed: unlike the flat
   path, grouped composers render OUTSIDE the row table, so they never disturb the
   window's index math.
4. `SprintBoard.tsx` measuring strategy: `Always` when flat OR grouped-virtualized;
   `WhileDragging` only for small non-virtualized grouped boards.
5. Expanded sprint-group headers become drop targets (`group-header:<sprintId>`, data
   `{type:"group-zone", sprintId}`): pointerWithin in `boardCollisionDetection`, drag-over/
   drag-end prefix handling in `useSprintBoardDragDrop.ts`, brand-ring isOver treatment.
6. Tests: new grouped-virtualization test (windowed mount, under-threshold plain, collapsed,
   composer opt-out, divider); header-drop case in `SprintBoardDragDrop.test.tsx`; existing
   suites stay green.

## Acceptance Criteria

- [x] In the All view with a large board (hundreds+ of tickets across many sprints), only the
      rows near the viewport are in the DOM; scrolling stays smooth. <!-- Verified live: ~50-80 <tr> mounted on a ~9000-item All view; off-screen groups render one spacer row -->
- [x] Group headers (`GroupStatBar`), collapse/expand, per-group status filter, sync, create,
      the "Finished work" divider, and placeholders all still render and behave as before. <!-- headers/collapse/status-filter verified live; divider + placeholders covered by TicketTable.groupedVirtualization.test.tsx -->
- [x] Drag & drop in the All view is smooth end-to-end (start AND drag-through): reorder within
      a sprint, cross-sprint drop onto a row and onto an empty group-zone, and drop onto a
      sprint-slot tile all still work. <!-- drag start, ghost, drop bar, header-ring hover and mid-drag auto-scroll row mounting verified live; drop handlers unit-tested. NEW: expanded group headers are drop targets (group-header:) -->
- [x] The virtual window is correctly positioned under content above the table (analytics
      panel), as in the flat view. <!-- per-group scrollMargin measured via rect deltas + ResizeObserver on the group stack (BRDG-416 pattern) -->
- [x] No regression in the BRDG-405/416 per-row render fan-out (toggling one row does not
      re-render the others) or in the pending-edits / pending-moves overlay. <!-- TicketTable.renderCount.test.tsx green; makeRowProps contract unchanged -->

## Tests

- [x] Grouped-virtualization test: with many groups/rows, assert only a windowed subset of
      `BoardRow`s mount (mirror the flat virtualizer test / TicketTable.renderCount harness). <!-- src/components/sprint-board/TicketTable.groupedVirtualization.test.tsx (7 tests) -->
- [x] Grouped DnD test stays green (cross-sprint drop, group-zone, reorder). <!-- SprintBoardDragDrop.test.tsx + useSprintBoardDragDrop.test.ts incl. new group-header drop cases -->
- [x] Existing SprintBoard / TicketTable / render-count / moveMeter tests stay green. <!-- full suite: 665 files / 7534 tests green + npm run build green -->

## Verification (2026-07-03)

Live E2E on the dev board (All view, ~9000 items, 40 group cards):

- 51-77 total `<tr>` mounted at any scroll position (was ~2800+ rows); off-viewport groups
  hold their height through a single spacer row.
- Deep scroll renders correct rows/cards mid-board with intact card chrome.
- Drag: ghost + drop bar appear, dragging over an expanded sprint header shows the brand
  ring (new drop affordance), auto-scroll at the viewport edge scrolled 646px and mounted
  new rows mid-drag (measuring strategy Always while windowed).
- Collapse/expand and the per-group status filter work on windowed groups.
- No JS errors (only standard Clerk dev-key warnings).

## Related

- Drag measuring fix (commit `a6582bb2`) — the interim that made drags *start* on the All view;
  this story makes them *light throughout* and lets `dndMeasuringStrategy` be reconsidered.
- [[BRDG-347-*]] — enabled DnD on large virtualized (flat) lists; source of the `Always`
  measuring strategy and the mount/unmount-on-scroll-during-drag requirement.
- [[BRDG-416-board-render-fanout-and-virtualizer]] — flat virtualizer offset + per-row render
  fan-out fix + the scrollMargin layout-effect this reuses.
- [[BRDG-405-board-render-performance]] — board render-performance baseline.
- [[BRDG-415-finish-board-row-actions-glue-convergence]] — shared row-actions the grouped rows use.
- Touch points: `TicketTable.tsx` (groupedTable), `SprintBoard.tsx` (dndMeasuringStrategy),
  `useGroupBy.ts`, `useSprintBoardDragDrop.ts`.
