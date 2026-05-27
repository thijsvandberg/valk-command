# BRDG-202a: Split SprintBoard Component

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`SprintBoard.tsx` is the largest component in the codebase at 1,466 lines. It mixes drag-drop logic, filtering, sorting, grouping, keyboard shortcuts, and state management in a single file.

## Checklist

- [ ] Extract drag-drop logic into `useSprintBoardDragDrop` hook
- [ ] Extract keyboard shortcut handling into `useSprintBoardShortcuts` hook
- [ ] Extract column rendering into `SprintBoardColumn` component
- [ ] Extract grouping/sorting logic into utility functions
- [ ] Verify `SprintBoard.tsx` is under 300 lines after refactor
- [ ] All existing sprint board tests pass
