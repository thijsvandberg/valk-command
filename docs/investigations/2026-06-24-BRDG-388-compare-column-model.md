# BRDG-388 Phase 0 — Compare view column-model decision

**Date:** 2026-06-24
**Story:** [BRDG-388](../user-stories/BRDG-388-compare-view-adopt-board-row.md)

## Question

The multi-sprint Compare view (`/sprint-board/compare`) renders rows through the legacy dense `TicketRow`, the last remaining bespoke row component. The story wants every ticket list to render through the shared `BoardRow` / `SortableBoardRow`. The blocker: the two layouts do not map 1:1.

- **`TicketRow`** renders each metadata field in its **own `<td>` column**, driven by `col` (visibility predicate) and `columnOrder`. The Compare view layers column headers (`COMPARE_HEADER_LABELS`), show/hide toggles, drag-to-reorder, and resize handles on top — all persisted in localStorage via `loadCompareColumns()` / `saveCompareColumns()`. It reads as an aligned spreadsheet grid across two sprints.
- **`BoardRow`** renders a **single `<td>`** with an inline metadata cluster that wraps/hides by width. No column alignment, no per-column headers/resize.

## Findings (code facts)

- `TicketRow.tsx` is ~686 lines, imported only by `SortableTicketRow` in `DroppableSprintColumn.tsx` (the only real importer; `EpicTicketList.tsx` has an unrelated same-named inline component).
- The Compare grid's column state (`compareColState`: visible/order/widths) lives in `MultiSprintView.tsx`, persisted to localStorage, and is fed to both left/right `DroppableSprintColumn` instances.
- `DroppableSprintColumn` builds `<table><colgroup><thead>/<tbody>` with per-column `<th>` headers + `ColumnResizeHandle`, and maps `activeOrder` to `<td>`s in `TicketRow`.
- Cross-column DnD, shift-range selection, and context menu wiring live in `MultiSprintView` / `DroppableSprintColumn`, **not** in the row — so the row swap does not touch that logic.
- The Compare view is **actively in use** (Compare button in `SprintBoardHeader`, no deprecation markers/flags), despite project memory tagging `TicketRow` as legacy.
- `BoardRow`'s `SortableBoardRow` prop shape (`dragListeners` / `dragAttributes` / `rowStyle`) already matches `SortableTicketRow`.

## Options considered

1. **Add an optional column mode to `BoardRow`** — keeps the Compare grid, retires `TicketRow`. Largest scope; changes a perf-critical shared component.
2. **Accept `BoardRow`'s inline cluster in Compare** — simplest, fully shares the row, retires `TicketRow`. Loses the per-field column alignment, headers, show/hide, reorder, resize in the Compare view.
3. **Fallback** — extract a shared row-surface styling helper only; does not retire `TicketRow`. Story goal not met.

## Decision

**Option 2 — accept `BoardRow`'s inline cluster.** (PO decision, 2026-06-24.)

The Compare view will render rows via `SortableBoardRow` and look like the board (inline cluster) rather than a spreadsheet grid. `TicketRow.tsx` is retired. The column-model machinery in the Compare view (column headers, show/hide, reorder, resize, the `colgroup`/`thead`, and the `compareColState` persistence) is removed since the inline cluster has no per-field columns to drive.

### Consequences for implementation

- `DroppableSprintColumn` no longer needs `col` / `columnOrder` / `activeOrder` / `colgroup` / per-column `<th>` headers / `ColumnResizeHandle`. The `<table>` keeps a `<tbody>` of `SortableBoardRow`s (BoardRow already renders its own single `<td>`, so a thin `<thead>` or none is fine).
- `MultiSprintView`'s `compareColState` (visible/order/widths) load/save plumbing becomes dead and is removed.
- Cross-column DnD, shift-range selection, and context menu must be preserved at the `DroppableSprintColumn` / `MultiSprintView` level.
- `TicketRow.tsx` and `TicketRow.test.tsx` move to `deleted/` once nothing imports them.
