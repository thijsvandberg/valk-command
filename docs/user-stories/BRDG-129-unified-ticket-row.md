# BRDG-129: Unified Ticket Row Component

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the Sprint Board and Compare view to use the same ticket row component so the UI is consistent and future improvements apply everywhere at once.

## Problem

The Sprint Board uses `TicketRow.tsx` (via `TicketTable.tsx`) while the Compare view has a completely separate inline `SortableTicketRow` implementation inside `MultiSprintView.tsx` (~lines 56-170). This causes:

- **Visual inconsistency**: different column widths, styling, and hover behavior between views
- **Feature drift**: Sprint Board rows support inline editing, edit-state dots, quality badges, pipeline health, etc. Compare rows have none of these
- **Maintenance burden**: bug fixes or styling changes need to be applied in two places

### Current differences

| Aspect | Sprint Board (`TicketRow`) | Compare (`SortableTicketRow` in MultiSprintView) |
|--------|---------------------------|--------------------------------------------------|
| Component | Shared, 571 lines | Inline, ~115 lines |
| Columns | 13 configurable | 7 hardcoded (checkbox, type, key, title, status, points, assignee) |
| Column resize | Yes | No |
| Sorting | 8 sortable columns | None |
| Virtualization | Yes (80+ items) | No |
| Inline editing | Title editing | None |
| Edit-state dots | Yes | No |
| Quality badge | Yes | No |
| Pipeline health | Yes | No |
| Sticky columns | Yes | No |

## Implementation Plan

1. **Define preset types** in `FilterBar.tsx`: Add `ColumnPreset` type (`"full" | "compact"`) and `COLUMN_PRESETS` mapping each preset to its `ColumnId[]` set. Compact = `type`, `key`, `title`, `jiraStatus`, `points`, `assignee`.
2. **Add `preset` prop to `TicketRowBaseProps`** in `TicketRow.tsx`: When supplied, derives `col()` and `columnOrder` internally. Make Sprint Board-only props optional with defaults (sprintNameMap, poStatuses, readinessMap, editing props, etc.).
3. **Make `key` cell render mode-aware**: In compact mode, render plain `font-mono text-xs text-white/40` text instead of `TicketStatusPill` + edit dots + star.
4. **Make title cell mode-aware**: Already conditional on `onTitleChange`. In compact mode, ensure styling matches Compare view.
5. **Add `sortableData` prop to `SortableTicketRow`**: Compare needs `data: { columnId }` while Sprint Board needs `data: { sprintId }`. Support both via optional override.
6. **Migrate Compare view**: Replace inline `SortableTicketRow` in `MultiSprintView.tsx` with shared component using `preset="compact"` and `sortableData={{ columnId }}`.
7. **Update Compare `<thead>`** to derive from preset columns for consistency.
8. **Remove old inline implementation** from `MultiSprintView.tsx`.
9. **Visual parity**: Adjust cell padding/sizing in compact mode to match existing Compare styling.
10. **Verify DragOverlay**: Ensure Compare overlay still works (it's in parent, unaffected by row refactor).
11. **Performance**: Compare columns hold ~25 tickets each; no virtualization needed.

## Acceptance Criteria

### Phase 1: Extract shared TicketRow base
- [x] Create a column-preset system so `TicketRow` can accept a reduced column set (e.g. `preset: "compact"` for Compare, `preset: "full"` for Sprint Board)
- [x] Ensure `TicketRow` supports an optional leading checkbox column for multi-select (needed by Compare)
- [x] Verify that `TicketRow` works without features it does not need in Compare context (no inline editing, no column resize, no sorting headers)

### Phase 2: Migrate Compare view to shared component
- [ ] Replace inline `SortableTicketRow` in `MultiSprintView.tsx` with the shared `TicketRow` wrapped in `useSortable`
- [ ] Wire up the existing Compare column set (type, key, title, status, points, assignee) via the preset system
- [ ] Preserve existing Compare-specific behavior: per-column search, cross-column DnD, multi-select checkboxes
- [ ] Remove the old inline implementation from `MultiSprintView.tsx`

### Phase 3: Visual parity and polish
- [ ] Confirm both views render identically for the shared columns (font, spacing, colors, hover states)
- [ ] Verify drag overlay appearance matches between views
- [ ] Test with 50+ tickets in Compare view to ensure no performance regression (add virtualization if needed)

## Technical Notes

- Key files: `src/components/sprint-board/TicketRow.tsx`, `src/components/sprint-board/TicketTable.tsx`, `src/components/sprint-board/MultiSprintView.tsx`
- Shared cell utilities already exist in `TicketTableCells.tsx`, these should be reused
- The `TicketRow` component already accepts props to toggle features (e.g. `visibleColumns`, `onTitleSave`). Extending this is preferable over creating a new abstraction
- Consider whether `TicketTable` itself (with sorting/grouping) could also be reused in Compare, or whether only the row component should be shared

## Out of Scope

- Adding new columns to the Compare view (separate story)
- Changing the two-column Compare layout itself
- Adding virtualization to Compare (only if performance requires it)
