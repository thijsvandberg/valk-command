# BRDG-259: All-view — default to active/upcoming sprints, filter to show closed

**Status:** Ready
**Priority:** Medium
**Source:** PO request (follow-up from BRDG-239)

## Description

As a Product Owner, when I open the **All** view grouped by sprint, I currently see *every* sprint as a group — including many long-closed/completed sprints. That makes the list noisy and pushes the relevant sprints down.

I want the grouped All view to **show only active and upcoming sprints by default**, with a filter option to reveal closed/completed sprints when I need them.

## Implementation Plan

**Design decisions (refined with PO):** No separate toggle. Instead the existing **Sprint filter** gains a "By state" section with three buckets — **Active / Future / Closed sprints** — rendered in a distinct sub-section with state-colored dots, above the individual sprints. Behaviour is **exclusive**: selecting a state shows only sprints of that state; selecting nothing keeps the default (active + future + backlog visible, closed hidden in the grouped view). Individual sprint selections always win (union with the state buckets): an explicitly picked sprint — even a closed one — is always shown. State buckets persist for free because they live as prefixed values inside the existing `sprint` filter array (`StoredFilters`), so they reset with "Clear" and ride into saved views. Unknown/cache-dropped sprints are treated as closed.

1. **`filter-bar-types.ts`** — add `SPRINT_STATE_FILTER_PREFIX`, `SPRINT_STATE_CLOSED`, `SPRINT_STATE_FILTER_OPTIONS` (active/future/closed + label + dot color), and `isSprintStateFilter()`. (AC2)
2. **`FilterDropdown.tsx`** — add generic `leadingOptions` / `leadingLabel` support: a distinct section with a heading and colored-dot rows above the regular list, hidden while searching. (AC2, "mooie manier")
3. **`useSprintBoardFilters.ts`** — accept a `sprintStateMap`; `scopeFiltered` now matches a ticket when its sprint id is selected **or** its sprint state is in a selected bucket (union). Expose derived `includeClosedSprints` (Closed bucket selected) and `forceShowSprintIds` (individually selected ids). (AC1, AC3, AC5)
4. **`useGroupBy.ts`** — add `forceShowSprintIds`; closed/unknown sprint groups are hidden by default unless `includeClosedSprints`, pinned, **or** force-shown by id. (AC1, AC5)
5. **`SprintBoard.tsx`** — build `sprintStateMap`, pass to filters hook; pass `includeClosedSprints` + `forceShowSprintIds` to `useGroupBy`; Sprint dropdown gets the state buckets via `leadingOptions`. (wiring)
6. **AC4** — per-group `GroupStatBar` stats derive from `group.tickets`; the grouped table renders only visible `groups` (no orphan bucket), and the item-count header reflects the filtered ticket set. Verified in code and in the browser (selecting Closed dropped the count 1644 → 495).
7. **Tests** — `useGroupBy.test.ts` (default hides closed, force-show by id reveals closed/unknown, pinned-closed shown, Backlog always shown); `useSprintBoardFilters.test.ts` (exclusive state filtering, union with id, force-show derivation, persistence); `FilterBar.test.tsx` (state buckets render in Sprint filter, fire onChange); `FilterDropdown.test.tsx` (leadingOptions render, select, hidden while searching). (AC6)

## Acceptance Criteria

- [x] On the All view grouped by sprint, only sprint groups whose sprint is **active** or **future/upcoming** are shown by default. The Backlog group keeps its current behaviour.
- [x] A filter control lets the PO opt closed/completed sprints back into view (e.g. an "Include closed sprints" toggle, or a sprint-state option in the existing Sprint filter). <!-- "By state" buckets (Active/Future/Closed) inside the Sprint filter; exclusive selection; All view only -->
- [x] The choice persists across reloads (same pattern as the other board filters). <!-- state buckets are prefixed values inside the existing sprint[] filter array (localStorage), reset with Clear, ride into saved views -->
- [x] When closed sprints are hidden, the item/stat counts and any "All tickets" total reflect what is actually shown (or clearly indicate the hidden scope — decide during refinement). <!-- per-group GroupStatBar derives from group.tickets; grouped table renders only visible groups; header item count tracks the filtered set (verified 1644->495) -->
- [x] Tickets without a sprint / in closed sprints are not silently dropped from other views; this only affects the grouped All view. <!-- state matching lives in scopeFiltered/groupBySprintFn; individual sprint selections always win -->
- [x] Tests cover: default hides closed sprints, toggle reveals them, persistence. <!-- covered as state-bucket reveal + force-show + persistence -->

> Refinement note: the open question (separate toggle vs. state options in the Sprint filter) was resolved with the PO in favour of exclusive state buckets inside the Sprint filter; the standalone toggle was dropped.

## Notes / pointers

- Grouping happens in `useGroupBy` (`src/components/sprint-board/useGroupBy.ts`); the grouped render is in `TicketTable.tsx` (`groupedTable`).
- Sprint state is available on the `Sprint` objects (`state`: active / closed / future / backlog) built in `SprintBoard.tsx` (`mapJiraSprints` + the appended Backlog entry).
- Filter state + persistence lives in `useSprintBoardFilters.ts` (localStorage-backed); the Sprint filter UI is in `FilterBar.tsx`. A new toggle could live in the FilterBar or the sort/group controls in `SprintSlots.tsx`.
- Open question for refinement: separate "Include closed sprints" toggle vs. extending the existing Sprint filter with state options; and how counts should reflect the hidden scope.

## Out of scope

- The per-sprint board tabs (single-sprint views) — this only concerns the grouped All view.
