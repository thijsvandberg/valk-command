# BRDG-071: Customizable Sprint Board Columns

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to show/hide and reorder columns on the Sprint Board so I can focus on relevant fields for different workflows (refinement vs. standup vs. review).

## Implementation Plan

1. **`FilterBar.tsx`** — Extend `SavedView` with optional `columnConfig?: { visible: ColumnId[]; order: ColumnId[] }`. Add `onReset` optional prop to `ColumnToggle`; render a divider + "Reset to default" button at the bottom of the dropdown.
2. **`useColumnConfig.ts`** — Add `resetTo(order, visible)` batch setter (sets both fields + persists in one call). Add `resetToDefaults()` that calls `resetTo` with `DEFAULT_ORDER` / `DEFAULT_VISIBLE`.
3. **`useSprintBoardFilters.ts`** — Add `externalOrder?: ColumnId[]` and `onApplyColumnConfig?: (visible: ColumnId[], order: ColumnId[]) => void` params. Update `handleSaveView` to snapshot `columnConfig`. Update `handleViewClick` to call `onApplyColumnConfig` when the loaded view carries a `columnConfig` (backwards compatible: no-op if absent).
4. **`SprintSlots.tsx`** — Add optional `onColumnReset` prop; pass it through to `ColumnToggle`.
5. **`SprintBoard.tsx`** — Wire `columnOrder` + `resetTo` callback into `useSprintBoardFilters`. Pass `resetToDefaults` to both `SprintSlots` instances.
6. **`TicketTable.tsx`** — Add a `ResizeObserver` on `tableContainerRef` to track `containerWidth`. Compute a `columnScale` factor: when sum of visible fixed-width columns > `(containerWidth - MIN_TITLE_WIDTH)`, scale all columns down proportionally. Apply via `scaledColW()` in `renderHeaderCell`.

## Acceptance Criteria

### Phase 1: Column visibility toggle
- [x] "Columns" button in the Sprint Board toolbar
- [x] Dropdown/popover with checklist of all available columns
- [x] Toggle to show/hide individual columns

### Phase 2: Column reorder
- [x] Drag-and-drop column reorder in the columns popover
- [x] Updated column order reflected immediately in the table

### Phase 3: Saved views include column config
- [x] Extend existing filter bookmark to also persist column visibility and order
- [x] When saving a named view, the current column config is captured alongside the active filters
- [x] Loading a saved view restores both the filters and the column config

### Phase 4: Persistence & reset
- [x] Column configuration persists across sessions (stored via `/api/settings/column-config`)
- [x] Default configuration for new users shows all columns
- [x] Reset to default option (restore DEFAULT_VISIBLE and DEFAULT_ORDER)

### Phase 5: Horizontal scroll fix
- [x] Sprint Board table no longer overflows horizontally when all columns are visible
- [x] Table layout adapts to viewport width (e.g. flexible column widths, no hard min-width)

## Technical Notes

- Column config is stored as JSON in `appSetting` via the existing `/api/settings/column-config` route
- Filter bookmarks stored in `savedFilterView` table — extend the stored JSON to include `columnOrder` and `columnVisible` fields
- On load: if a saved view has no column config, leave current column state unchanged (backwards compatible)
- Reset to default: call `toggleColumn` / `setColumnOrder` with DEFAULT_VISIBLE and DEFAULT_ORDER from `FilterBar.tsx`

## Out of Scope
- Custom columns (user-defined fields)
- Column grouping/nesting
- Per-sprint column configurations
- Built-in named presets (Refinement/Standup/Review) as separate concept
