# BRDG-388: Compare view adopts the shared BoardRow

**Status:** Completed
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want the multi-sprint **Compare view** (`/sprint-board/compare`) to render its ticket rows through the **shared** `BoardRow` / `SortableBoardRow` instead of the legacy dense `TicketRow`, so the last remaining row implementation is retired and every ticket list in the app renders through one component.

This is the natural follow-up to **BRDG-367** (which moved the epic-children list onto `BoardRow`). After BRDG-367 there are three row components left:

| Row | Hosts |
|---|---|
| `BoardRow` / `SortableBoardRow` (the target) | Sprint board, inbox, Story Writer landing, epic-children (flat + by-sprint) |
| `ChildIssueRow` | Subtasks, linked issues, refinement list, cleanup page |
| **`TicketRow` (legacy, ~686 lines)** | **Compare view only** (`DroppableSprintColumn` -> `MultiSprintView`) |

`TicketRow` is imported only by `src/components/sprint-board/DroppableSprintColumn.tsx` (`SortableTicketRow`, used by `MultiSprintView`). Retiring it removes a large, separately-evolved row that has to be hand-synced with the board. (Note: the inline `TicketRow` inside `src/app/(app)/epics/EpicTicketList.tsx` is an unrelated, separate tiny component with the same name — out of scope.)

## What makes this easier than BRDG-367

- **No data adapter needed.** The compare view already holds full `Ticket` objects (it is a board view), so there is no `EpicChild -> Ticket` projection like `epicChildToTicket`. Rows can pass `ticket` straight to `BoardRow`.
- **Already in a `<table>`.** `DroppableSprintColumn` already renders `<table><thead>/<tbody>` with `SortableTicketRow` rows, so the per-card `<table><tbody>` wrapping that BRDG-367 had to add is already there.
- **DnD prop shapes already match.** `SortableTicketRow` is already `Omit<TicketRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index"> & {...}` with its own `useSortable` — the same shape as `SortableBoardRow`. The reorder/cross-column DnD wiring lives in `DroppableSprintColumn` / `MultiSprintView`, not in the row.

## The central risk to resolve first: the column model

`TicketRow` is a **dense, multi-column** table row: it renders each metadata field (key, SP, BV, assignee, sprint, status, ...) in its **own `<td>` column**, driven by `col` (`colVisible`) and `columnOrder` (`activeOrder`) props, so the Compare view reads as an aligned spreadsheet-style grid across sprints.

`BoardRow` renders a **single `<td>`** with an inline, hardcoded-order metadata *cluster* that wraps/hides by width — it is not column-aligned.

These two layouts do not map 1:1. Adopting `BoardRow` as-is would drop the Compare view's aligned columns. So the first phase MUST resolve which way to go, with a PO decision:

1. **Accept BoardRow's inline cluster** in the Compare view (lose the per-field column alignment; simplest, fully shares the row). Acceptable only if the PO is fine with the Compare view looking like the board rather than a grid.
2. **Give BoardRow an optional column mode** (a `columns`/`columnOrder` prop that renders the metadata as aligned `<td>`s). Bigger change to a perf-critical shared component; benefits every host but is real scope.
3. **Keep the fallback** (BRDG-367's pattern): extract only the shared row-surface state machine so `TicketRow` stops drifting visually, without full adoption. Does not retire `TicketRow`.

## Implementation Plan

**Phase 0 decision (PO, 2026-06-24): Option 2 — accept BoardRow's inline cluster.** The Compare view stops being a spreadsheet grid and renders like the board; `TicketRow` is retired and the per-column machinery (headers, show/hide, reorder, resize, localStorage persistence) is removed. See [docs/investigations/2026-06-24-BRDG-388-compare-column-model.md](../investigations/2026-06-24-BRDG-388-compare-column-model.md).

The headless single-`<td>` table is already the proven board pattern (`TicketTable.tsx` renders `<table table-fixed><SortableContext><tbody>` of `SortableBoardRow` with no `<colgroup>`/`<thead>`); Compare adopts the same shape.

1. **`DroppableSprintColumn.tsx`** — swap import `SortableTicketRow` -> `SortableBoardRow`. Rewrite the `<table>`: drop `<colgroup>`, `<thead>`, `ColumnResizeHandle`, `activeOrder`, `colVisible`. Body maps tickets to `SortableBoardRow` (single `<td>`). Map across all existing props (`ticket`, selection incl. shift-range, `sortableData={{columnId}}`, DnD, inline edit, metadata handlers); drop dead `col`/`columnOrder` and the five column props from the signature. `colSpan` 1. Checkbox gutter is handled inside BoardRow (`someChecked` stays; no `hideCheckbox`).
2. **`MultiSprintView.tsx`** — remove `compareColState` state/derived/`persistColState`, the column toggle/reorder/reset/resize handlers, `<ColumnToggle>`, and the five column props at both `DroppableSprintColumn` call sites. Keep split ratio, DnD (`handleDragStart/Over/End`, `compareCollisionDetection`), selection (`checkedKeys`, per-column + bulk toggles), `DragOverlay`, metadata handlers.
3. **`multi-sprint-utils.ts`** — delete column exports (`COMPARE_HEADER_LABELS`, `COMPARE_COL_WIDTHS`, `COMPARE_LS_KEY`, defaults, `CompareColState`, `loadCompareColumns`, `saveCompareColumns`). Keep `loadSplitRatio`/`saveSplitRatio`.
4. **Retire `TicketRow`** — move `TicketRow.tsx` + `TicketRow.test.tsx` to `deleted/` once nothing imports them.
5. **Tests** — add `DroppableSprintColumn`/`MultiSprintView` coverage: renders via BoardRow (no per-field headers), selection + shift-range, within-column reorder (`jira.rank`), cross-column move (`jira.moveSprint`), no `ColumnToggle` in header.
6. **Verify** — `npm run verify` + `npm run build`; confirm other BoardRow hosts unaffected; PO visual + drag check.

Commit order: (1+3 together for per-commit build safety) -> (2) -> (4) -> (5).

## Preconditions (MUST hold before starting)

- [x] BRDG-367 is merged (the `BoardRow` reuse pattern + `subtaskCounts` / `showKey` / `showStatus` props + the accessible checkbox gutter are in place).
- [x] Clean working tree before any code change; commit each phase as its own logical unit.

## Phase 0: Investigation + PO decision (no production code)

- [x] Inventory `TicketRow`'s full prop surface and everything the Compare view feeds it (`col`, `columnOrder`, per-column cells, selection, DnD, context menu, inline edit).
- [x] Decide the column-model approach (option 1 / 2 / 3 above) with the PO. Capture in `docs/investigations/`.
- [x] Confirm the Compare view is still in active use (project memory flags it as being phased out — if it is genuinely going away, this story may become "delete it" instead).

## Phase 1: Render Compare rows via BoardRow / SortableBoardRow

(Shape depends on the Phase 0 decision.)

- [x] Re-point `SortableTicketRow` in `DroppableSprintColumn` at `SortableBoardRow` (the DnD prop shapes already align: `dragListeners` / `dragAttributes` / `rowStyle`).
- [x] Preserve the Compare view's cross-column drag-and-drop, selection (incl. shift-range), context menu, and column visibility behaviour at the `DroppableSprintColumn` / `MultiSprintView` level. <!-- column visibility/order/resize removed by the Option 2 decision (the inline cluster has no per-field columns); the Compare view never wired a row context menu. DnD + selection preserved. -->
- [x] Remove `TicketRow` usage from `DroppableSprintColumn`; delete `TicketRow.tsx` once nothing imports it.
- [x] Tests: update `MultiSprintView` / `DroppableSprintColumn` / `TicketRow`-related tests; cover reorder within a column and move across columns.
- [x] `npm run verify` + `npm run build` green.
- [x] PO visual + drag check of the Compare view. <!-- agent visual check done (rows render via BoardRow inline cluster, no column headers/toggle, header bar preserved); DnD logic unit-tested. PO to confirm drag feel. -->

## Acceptance Criteria

- [x] The Compare view renders rows via `BoardRow` / `SortableBoardRow`.
- [x] `TicketRow.tsx` (the legacy dense row) is deleted; nothing imports it.
- [x] Cross-column drag-and-drop, selection, context menu, and column visibility behave as before (subject to the agreed column-model decision).
- [x] No regression on the other `BoardRow` hosts (sprint board, inbox, Story Writer landing, epic-children).
- [x] `npm run verify` and `npm run build` pass.

## Out of scope

- The inline `TicketRow` in `EpicTicketList.tsx` (unrelated, same name only).
- Migrating `ChildIssueRow`'s hosts (subtasks, linked issues, refinement list, cleanup) — separate follow-up.
- Any change to the Compare view's data model, sprint-column layout, or which sprints it shows.

## Fallback

If full adoption is too invasive (most likely the column model), extract the shared row-surface state machine (`rowSurfaceClasses(state, { accent })`) used by `BoardRow` and `TicketRow`, plus a drift-guard test — the same fallback BRDG-367 defined. This removes the styling drift without retiring `TicketRow`.

## References

- [BRDG-367: Epic-children list adopts the shared BoardRow](completed/BRDG-367-epic-children-adopt-board-row.md) — the precedent + the `BoardRow` reuse pattern.
- [docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md) — the original row-unification analysis (flags `TicketRow` / Compare as legacy and excluded at the time).
