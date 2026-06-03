# BRDG-273: Multiselect + bulk-action toolbar for epic child issues

**Status:** Completed
**Priority:** Medium
**Type:** Feature
**Depends on:** BRDG-268 (drag/move between sprints), BRDG-267 (the "By sprint" grouped view)

## Description

As a PO, in an epic's Child Issues section, I want the same multiselect checkboxes and bulk-action toolbar that the sprint board has, so I can act on several children at once (move them to a sprint, set status/readiness, flag, etc.) without doing it one row at a time.

This mirrors the sprint board's pattern: a per-row checkbox (hidden until hover, pinned open once any row is checked), shift-click range select, and a sticky bottom `BulkActionBar` with the selection count, SP/BV totals, select-all, and the action dropdowns.

## Scope (decided with PO)

- **Full board action set** in the toolbar.
- **Both views**: the flat List view and the grouped By-sprint view.

## Requirements

- [x] Per-row checkbox on `ChildIssueRow` (hover-reveal, pinned when any row is checked), with the brand-tinted checked state and a checked-row highlight
- [x] Selection state in `EpicChildrenSection`; shift-click selects a contiguous range in the current view's rendered order
- [x] Checkboxes work in **both** the List view and the By-sprint grouped view (threaded through `EpicChildrenBySprint`), and never on pending rows
- [x] Reuse the existing `BulkActionBar` (sticky bottom) with selection count, SP/BV totals, select-all, and Clear
- [x] Full action set wired: Set Status, Set Readiness, Set Epic, Move to Sprint, Update Assignee, Add/Update Label, Flag/Remove flag (Update dropdown); Review Story, Generate Subtasks (AI Assist); Copy List, Add to Refinement (standalone)
- [x] Bulk Move to Sprint reuses `jira.moveSprint` with all selected keys and the same optimistic re-group + revert as BRDG-268
- [x] Each bulk op refetches via `onMutate` and reports a single summary toast (with failure counts)
- [x] Tests: toolbar appears on selection, select-all, clear, shift-range, bulk move (multi-key, single call), bulk flag (per-key), selection in by-sprint view; `ChildIssueRow` checkbox render/checked/click behavior

## Notes / out of scope

- **Refresh from Jira** and **Summarized List (stakeholder export)** from the board's bar are omitted: both are board/sprint-slot/workspace-export specific and don't map to an epic's own children.
- Flag state is shown as "mixed" (both Flag and Remove flag offered) because `EpicChild` carries no `flagged` field to aggregate.
- Bulk operations rely on `onMutate` refetch for the final state (no per-row optimistic visuals except sprint moves, which reuse BRDG-268's `localMoves`), matching how the board revalidates after bulk actions.
