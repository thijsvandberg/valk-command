# BRDG-202c: Split SearchModal and FilterBar

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`SearchModal.tsx` (1,068 lines) and `FilterBar.tsx` (874 lines) are tightly coupled and both oversized. Search result rendering and filter chip logic should be extracted into focused sub-components.

## Implementation Plan

1. **Extract FilterBar types/constants** into `filter-bar-types.ts` (PO_STATUS_COLORS, EDIT_STATE_OPTIONS, SortField, SortDir, SavedView, ColumnId, COLUMNS, DEFAULT_VISIBLE, COLUMN_PRESETS, SORT_OPTIONS, GAPS_OPTIONS). Re-export from FilterBar.tsx for backward compatibility.
2. **Extract SortControls.tsx** -- move SortDropdown component to its own file. Re-export from FilterBar.tsx.
3. **Extract ColumnToggle.tsx** -- move ColumnToggle, SortableColumnItem, COLUMN_LABEL_MAP, and all dnd-kit logic. Re-export from FilterBar.tsx.
4. **Extract SaveViewPopover.tsx and ExpandableSearch.tsx** -- private sub-components used only by FilterBar.
5. **Extract useSearchKeyboard hook** -- move handleKeyDown callback and scroll-into-view effect from SearchModal.
6. **Extract SearchModal JSX sections** -- SearchModalHeader, SearchModalFooter, LocalResultSections, JiraResultSection, SearchHistoryPanel into sub-component files.
7. **Verify both files under 300 lines**, all tests pass, build succeeds.

## Checklist

### SearchModal (1,068 lines)
- [x] Extract search result renderers into separate components (per result type)
- [x] Extract keyboard navigation logic into hook
- [x] Verify `SearchModal.tsx` is under 300 lines

### FilterBar (874 lines)
- [x] Extract filter chip rendering into `FilterChip` component
- [x] Extract sort controls into `SortControls` component
- [x] Extract drag-drop ordering into hook
- [x] Verify `FilterBar.tsx` is under 300 lines

- [x] All existing search and filter tests pass
