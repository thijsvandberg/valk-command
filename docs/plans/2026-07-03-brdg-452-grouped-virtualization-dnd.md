# BRDG-452 Implementation Plan: Virtualize the grouped All view and make drag & drop workable at 500+ tickets

**Story:** [BRDG-452](../user-stories/BRDG-452-virtualize-grouped-all-view.md)
**Date:** 2026-07-03
**Status:** Proposed (awaiting approval)

## Goal

The grouped All view mounts every row of every sprint (~2800 rows across 46 groups measured live). Drag & drop *starts* since commit `a6582bb2` (droppables measured `WhileDragging`), but the view is heavy throughout: render, scroll, and the drag itself. This plan windows the grouped view so only ~visible rows mount, then re-tunes DnD so a 500+ board drags smoothly end-to-end (start, auto-scroll mid-drag, and drop).

## Verified current state

- Flat (single-sprint) path is already virtualized AND drag-enabled: `SortableBoardRow` inside `SortableContext items={ticketIds} strategy={() => null}`, spacer `<tr>`s for offset, `measureElement` for dynamic heights, `scrollMargin` measured via layout effect + ResizeObserver (BRDG-416). `src/components/sprint-board/TicketTable.tsx:588-635`.
- Grouped path renders every `visibleGroupTickets` row of every expanded group, one `GroupCard` per group. `TicketTable.tsx:773-1046`.
- DnD model is virtualization-proof by design (BRDG-347 investigation): null sorting strategy (rows never transform), insert-line indicator, `DragOverlay` with `snapToPointer`. Drop-index math anchors on the `over` row key against a drag-start snapshot (`dragListSnapshotRef`), so mounting/unmounting rows mid-drag cannot corrupt the result. `useSprintBoardDragDrop.ts:271-303`.
- Measuring strategy: `groups.length > 0 ? WhileDragging : Always` (`SprintBoard.tsx:1114`). `WhileDragging` was the interim fix for 2800 always-mounted droppables; the flat virtualized path needs `Always` because rows mount during mid-drag auto-scroll and must be re-measured.
- Cross-sprint drop targets that are always mounted: `SprintDropZoneBar` tiles (top bar, shown during drag), `group-zone:` rows in empty expanded groups, and collapsed group headers (`CollapsedGroupDroppable`). Expanded non-empty group headers are NOT drop targets today.
- `boardCollisionDetection`: `pointerWithin` for `sprint-slot:`/`group-zone:` ids, `closestCenter` for ticket rows. `SprintBoardDragDrop.tsx:138-153`.
- Tests mock `@tanstack/react-virtual`, so windowed-mount assertions are straightforward (`TicketTable.renderCount.test.tsx:42`).
- Perf bug found while reading: the grouped path computes `tickets.findIndex(...)` per row (`TicketTable.tsx:865`) — O(n²) on every render, ~7.8M comparisons at 2800 rows. Fixed by this plan regardless of windowing.

## Design decision: per-group virtualization (deviates from the story's sketch)

The story sketches ONE flattened item list (`group-header | row | divider | placeholder | group-zone`) under a single virtualizer. That approach has a structural problem this codebase feels acutely: each group is an elevated card (`GROUP_CARD_CLASS`: rounded corners, border, shadow, `overflow-clip`) containing its own `<table>`. A single windowed sequence spanning groups either flattens the cards into one surface (visible redesign of the board) or reconstructs card chrome per visible segment (borders/corners feasible, a card-spanning shadow is not; high visual-regression risk).

**Chosen approach: window each group's rows inside its existing card.** Every expanded group keeps its real `GroupCard` + `GroupStatBar` + composer + placeholders + empty-state exactly as today; only the row `<tbody>` becomes a virtual window (the proven flat-path pattern, per group).

Why this is better here:

- Zero visual reconstruction. Card chrome, headers, composers, dividers, placeholders, empty-group zones and collapse behavior are untouched DOM.
- Reuses the exact pattern already proven in this codebase (BRDG-347 + BRDG-416): spacer rows, `measureElement`, scrollMargin, sortable rows in the window.
- Group headers (~46 `GroupStatBar`s) stay always mounted — that is cheap and desirable: they are the collapse/sync/create/filter surface and (see DnD below) drop targets.
- A collapsed group's body unmounts entirely (unchanged), so its virtualizer instance does not even exist.

Cost: one virtualizer instance per expanded group (~46 scroll listeners on the same container, each doing trivial math). This is well within budget; verified against a prod build during E2E (dev-mode numbers are misleading per project notes).

The story's open question "sprint grouping only or every grouped view?" resolves naturally: the change lives in the shared grouped render path, so epic grouping is windowed too. The DnD gate (`groupBy === "sprint"`) is unchanged.

## Implementation steps

### 1. Prerequisite quick win: kill the O(n²) flat-index lookup

In `TicketTable.tsx`, build `flatIdxByKey = useMemo(() => new Map(tickets.map((t, i) => [t.key, i])), [tickets])` and use it in the grouped row render instead of `tickets.findIndex`. Independent of everything else; land it first.

### 2. Extract a `VirtualizedGroupRows` component

New file `src/components/sprint-board/VirtualizedGroupRows.tsx` (hooks cannot run in the `groups.map` loop, so per-group state needs a component):

- Props: `items: GroupRowItem[]`, `scrollContainerRef`, and a `renderItem(item, index, measureRef)` callback so `makeRowProps`/`SortableBoardRow` wiring stays in `TicketTable`.
- `GroupRowItem` is a tiny discriminated union: `{ kind: "row"; ticket: Ticket; groupIdx: number } | { kind: "divider" }`. Only rows and the "Finished work" divider live inside the window (the divider sits between rows, so it must be an item with its own measured height). Composer, placeholders, and the empty-group `DroppableGroupZone` stay as real DOM outside the windowed `<tbody>`, exactly where they render today.
- Own `useVirtualizer`: `count = items.length`, `estimateSize` 44px, `overscan` 20, `measureElement`, `getScrollElement: () => scrollContainerRef.current`.
- scrollMargin: measure the group table's `offsetTop` within the scroll container using the BRDG-416 pattern (layout effect + ResizeObserver, same-value setState guard). Extract that existing block from `TicketTable.tsx:452-464` into a small shared hook (e.g. `useScrollMargin(elRef, scrollContainerRef)`) used by both the flat path and each group. Note: `offsetTop` is relative to the offset parent, not the scroll container; resolve by walking `offsetParent` or using `getBoundingClientRect` deltas against the scroller — the flat implementation's approach is the template.
- Renders the `<tbody>` with top/bottom spacer `<tr>`s (borrowed verbatim from `virtualBody`).

### 3. Wire it into the grouped path in `TicketTable.tsx`

- Gate: `const groupedVirtualizationActive = totalExpandedRowCount > GROUPED_VIRTUALIZE_THRESHOLD` where `totalExpandedRowCount` sums `visibleGroupTickets.length` over non-collapsed groups. Proposed threshold: **100** (constant next to the existing `VIRTUALIZE_THRESHOLD = 40`). Below it, the grouped path renders exactly as today (plain, no virtualizer instances). Keying on the TOTAL (not per-group size) is deliberate: 46 groups of 30 rows is just as heavy as 5 groups of 300.
- When active, EVERY expanded group windows its rows, with two per-group opt-outs rendering that one group plain:
  - its inline composer is open (`composerGroupKey === group.key`) — mirrors the flat `flatComposerActive` rule (injected non-ticket row breaks index math);
  - trivially small windows are fine to leave virtualized; no per-group size opt-out (consistency beats micro-optimizing empty spacers).
- `SortableContext items={groupTicketIds} strategy={() => null}` continues to wrap each group's body (SortableContext renders no DOM). Mounted rows compose the sortable ref with `measureElement` via the existing `measureRef` prop on `SortableBoardRow` — identical to the flat virtualized path.
- Row props are produced by the same `makeRowProps` (using the step-1 map for `flatIdx`), preserving the BRDG-405/416 fan-out contract: stable handler identities, individual boolean props, shallow-memo'd `BoardRow`.
- `isLastInCard` corner-rounding: computed from the item's `groupIdx` against `visibleGroupTickets.length` (already index-based, works for windowed rows).

### 4. Re-tune the DnD measuring strategy (`SprintBoard.tsx:1114`)

```
Always            when not grouped (flat, unchanged)
Always            when grouped AND grouped virtualization is active   <- new
WhileDragging     when grouped AND below threshold (small board, all rows mounted)
```

Rationale: with windowing, the mounted droppable set is ~visible rows only (tens, not thousands), so `Always` is cheap again — and required, because auto-scroll during a drag mounts new rows that must be measured mid-drag (the exact BRDG-347 lesson). SprintBoard needs the same `groupedVirtualizationActive` signal; compute it from `groups` + `collapsedGroups` (both already in scope) with the threshold constant exported from a shared module (not a route file).

### 5. Make expanded sprint-group headers drop targets (the "workable at 500+" piece)

Today a long-distance cross-sprint drag must hit a specific row, an empty-group zone, a collapsed header, or a top-bar tile. On a 46-group board the natural gesture — drop onto the target sprint's header — does nothing when that group is expanded. Fix:

- Wrap the expanded sprint-group header zone in a droppable with id `group-header:<sprintId>` and data `{ type: "group-zone", sprintId }` (a distinct id is required: an empty expanded group already registers `group-zone:<sprintId>`).
- `boardCollisionDetection`: add `group-header:` to the `pointerWithin` id set.
- `useSprintBoardDragDrop.ts`: extend the `group-zone:` drag-over exclusion and drag-end branch to also match `group-header:` (both read `sprintId` from droppable data; placement semantics identical to the existing zone drop — batch to bottom of sprint, top of backlog).
- Visual: reuse the `CollapsedGroupDroppable` treatment (brand ring on `isOver`) on the header while a drag is active. Only for sprint groups (`groupBy === "sprint"`), only during an external drag.

This makes every sprint reachable by scrolling until its header is visible and dropping, without needing row-level precision — combined with the always-visible drop tiles this is the workability story for 500+.

### 6. Tests

- New `TicketTable.groupedVirtualization.test.tsx`:
  - over threshold: with the virtualizer mocked to a fixed window, assert only the windowed subset of `BoardRow`s mounts per group and spacer rows carry the remaining height;
  - under threshold: all rows mount (plain path preserved);
  - collapsed group mounts no rows; composer-open group renders plain;
  - divider item renders at `dividerIdx` inside the window.
- `SprintBoardDragDrop.test.tsx`: existing cases stay green (fixtures are small, below threshold). Add: drop on `group-header:<sprintId>` moves the batch to that sprint (mirrors the group-zone case).
- `TicketTable.renderCount.test.tsx` (fan-out contract) and `SprintBoard.moveMeter` stay green untouched.
- Full suite + `npm run build` before commit, per project rules.

### 7. Manual E2E verification (Chrome, dev bypass, real board)

- All view (~2800 rows): DOM row count near-viewport only; scroll smoothness.
- Drag: start latency, auto-scroll through multiple groups mid-drag (rows mount and are hit-testable — validates the `Always` flip), drop on: row in another sprint, expanded header, collapsed header, empty-group zone, top-bar tile; reorder within a group with a per-group status filter active.
- BRDG-416 regression: open/close the analytics panel above the table; virtual windows stay positioned.
- Collapse/expand groups mid-session; pinned groups; epic grouping.
- Prod build sanity pass for scroll/drag feel (dev-mode Turbopack overhead misleads).

## Known parity limitation (not a regression)

Keyboard/search focus uses `scrollIntoView` on the focused row's DOM node (`useSearchKeyboard.ts:135`); an unmounted (windowed-out) row no-ops. The flat virtualized path has had this behavior since BRDG-347. If it bites, the follow-up is a `scrollToIndex` bridge — out of scope here.

## Out of scope

- Flat single-sprint virtualization and its DnD (done: BRDG-347/416).
- Grouping logic (`useGroupBy`) and move/rank semantics (`jira.moveSprint` / `jira.rank` unchanged).
- Non-board list views (Inbox, Epics) — no DnD there.
- Position-input / keyboard-move affordances (move-to-top/bottom already exists from BRDG-347).

## Risk register

| Risk | Mitigation |
|------|------------|
| ~46 virtualizer instances on one scroll container | Instances exist only for expanded groups; listeners are passive and cheap. Measured in prod build during E2E; fallback is lazy-activating virtualizers only for groups near the viewport (IntersectionObserver), not expected to be needed. |
| scrollMargin churn as estimated heights resolve to measured ones (earlier groups shift later groups' offsets) | ResizeObserver re-measure with same-value setState guard — the BRDG-416 pattern, already proven on the flat path. |
| Mid-drag re-measure cost with `Always` | Mounted droppable count is now bounded by the window (~40-80), same order as the flat path where `Always` already runs fine. |
| Visual seams in cards | None expected: card DOM untouched; only row rows are windowed inside the existing `<table>`. Verified via E2E screenshots. |
| Duplicate droppable ids (header vs empty-group zone) | Distinct `group-header:` prefix; both funnel into the same drag-end move logic via droppable data. |

## Sequencing

1. Step 1 (flat-index map) — isolated, lands first.
2. Steps 2+3 (windowing) with the new virtualization test.
3. Step 4 (measuring strategy) — one line + signal plumbing, verified by drag E2E.
4. Step 5 (header drop targets) + its tests.
5. Step 6/7 full test pass, build, E2E, then story checkboxes in `BRDG-452-virtualize-grouped-all-view.md`.
