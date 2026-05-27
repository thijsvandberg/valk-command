# BRDG-202c: Split SearchModal and FilterBar

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`SearchModal.tsx` (1,068 lines) and `FilterBar.tsx` (874 lines) are tightly coupled and both oversized. Search result rendering and filter chip logic should be extracted into focused sub-components.

## Checklist

### SearchModal (1,068 lines)
- [ ] Extract search result renderers into separate components (per result type)
- [ ] Extract keyboard navigation logic into hook
- [ ] Verify `SearchModal.tsx` is under 300 lines

### FilterBar (874 lines)
- [ ] Extract filter chip rendering into `FilterChip` component
- [ ] Extract sort controls into `SortControls` component
- [ ] Extract drag-drop ordering into hook
- [ ] Verify `FilterBar.tsx` is under 300 lines

- [ ] All existing search and filter tests pass
