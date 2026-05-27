# BRDG-202a: Split SprintBoard Component

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`SprintBoard.tsx` is the largest component in the codebase at 1,466 lines. It mixes drag-drop logic, filtering, sorting, grouping, keyboard shortcuts, and state management in a single file.

## Implementation Plan

1. **Extract drag-drop logic into `useSprintBoardDragDrop` hook** - Move DnD state (`boardActiveDragId`, `boardOverId`, `boardDragTargetSprintId`), sensors, enablement logic (`jiraRankDndEnabled`), and all three DnD event handlers (`handleBoardDragStart`, `handleBoardDragOver`, `handleBoardDragEnd`) into a new hook. Move `SprintDropTile`, `SprintDropZoneBar`, `snapToPointer`, and `boardCollisionDetection` into a new `SprintBoardDragDrop.tsx` component file.
2. **Extract keyboard shortcut handling into `useSprintBoardShortcuts` hook** - Move `handleTableKeyDown` (Escape, ArrowDown, ArrowUp, Enter) and the `valk:openSearch` global listener into a new hook.
3. **Extract column rendering into `SprintBoardBody` component** - Unify the two near-identical JSX blocks (DnD-wrapped and plain) into a single `SprintBoardBody` component that conditionally wraps in `DndContext` based on a `dnd` config prop.
4. **Extract grouping/sorting utility functions** - Move sprint stats computation (`computeSprintStats`) and work days calculation (`computeSprintWorkDays`) into `sprint-board-utils.ts`.
5. **Final verification** - Confirm `SprintBoard.tsx` is under 300 lines, all tests pass, lint + typecheck clean, build succeeds.

## Checklist

- [x] Extract drag-drop logic into `useSprintBoardDragDrop` hook
- [x] Extract keyboard shortcut handling into `useSprintBoardShortcuts` hook
- [x] Extract column rendering into `SprintBoardColumn` component
- [x] Extract grouping/sorting logic into utility functions
- [x] Verify `SprintBoard.tsx` is under 300 lines after refactor
- [ ] All existing sprint board tests pass
