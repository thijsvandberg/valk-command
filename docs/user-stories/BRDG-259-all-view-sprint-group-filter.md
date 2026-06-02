# BRDG-259: All-view — default to active/upcoming sprints, filter to show closed

**Status:** Ready
**Priority:** Medium
**Source:** PO request (follow-up from BRDG-239)

## Description

As a Product Owner, when I open the **All** view grouped by sprint, I currently see *every* sprint as a group — including many long-closed/completed sprints. That makes the list noisy and pushes the relevant sprints down.

I want the grouped All view to **show only active and upcoming sprints by default**, with a filter option to reveal closed/completed sprints when I need them.

## Acceptance Criteria

- [ ] On the All view grouped by sprint, only sprint groups whose sprint is **active** or **future/upcoming** are shown by default. The Backlog group keeps its current behaviour.
- [ ] A filter control lets the PO opt closed/completed sprints back into view (e.g. an "Include closed sprints" toggle, or a sprint-state option in the existing Sprint filter).
- [ ] The choice persists across reloads (same pattern as the other board filters).
- [ ] When closed sprints are hidden, the item/stat counts and any "All tickets" total reflect what is actually shown (or clearly indicate the hidden scope — decide during refinement).
- [ ] Tickets without a sprint / in closed sprints are not silently dropped from other views; this only affects the grouped All view.
- [ ] Tests cover: default hides closed sprints, toggle reveals them, persistence.

## Notes / pointers

- Grouping happens in `useGroupBy` (`src/components/sprint-board/useGroupBy.ts`); the grouped render is in `TicketTable.tsx` (`groupedTable`).
- Sprint state is available on the `Sprint` objects (`state`: active / closed / future / backlog) built in `SprintBoard.tsx` (`mapJiraSprints` + the appended Backlog entry).
- Filter state + persistence lives in `useSprintBoardFilters.ts` (localStorage-backed); the Sprint filter UI is in `FilterBar.tsx`. A new toggle could live in the FilterBar or the sort/group controls in `SprintSlots.tsx`.
- Open question for refinement: separate "Include closed sprints" toggle vs. extending the existing Sprint filter with state options; and how counts should reflect the hidden scope.

## Out of scope

- The per-sprint board tabs (single-sprint views) — this only concerns the grouped All view.
