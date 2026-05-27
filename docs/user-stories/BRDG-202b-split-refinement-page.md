# BRDG-202b: Split RefinementPageContent Component

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`RefinementPageContent.tsx` is 1,294 lines and mixes session management, filtering, resizable panes, and story queue navigation in a single file.

## Implementation Plan

1. **Extract utilities** into `refinement-utils.ts`: `LAST_UPDATED_OPTIONS`, `filterTickets`, `readinessRank`, `smartSort`, `MIN_TICKETS`, `MAX_TICKETS` constants. Re-export `filterTickets` from `RefinementPageContent.tsx` for backward compat.
2. **Extract `ResizableQueuePane`** into its own `.tsx` file (self-contained, ~55 lines).
3. **Extract `SortableQueueItem`** into its own `.tsx` file (~160 lines).
4. **Extract `TicketRow`** into its own `.tsx` file (~115 lines).
5. **Extract `useRefinementQueue` hook**: queue state, persistence, toggleTicket, drag-end, removeFromQueue.
6. **Extract `useRefinementFilters` hook + `RefinementFilters` component**: all filter state and filter bar UI.
7. **Extract `useBulkSuggest` hook**: bulk suggest state, polling, copy-to-clipboard.
8. **Reassemble `RefinementPageContent.tsx`** as thin orchestrator (~280 lines). Remove dead `selectedKeys` variable.
9. Verify line count under 300, run all tests.

## Checklist

- [x] Extract resizable pane logic into a reusable hook or component
- [x] Extract session filter UI into `RefinementFilters` component
- [x] Extract story queue management into `useRefinementQueue` hook
- [x] Verify `RefinementPageContent.tsx` is under 300 lines after refactor
- [x] All existing refinement tests pass
