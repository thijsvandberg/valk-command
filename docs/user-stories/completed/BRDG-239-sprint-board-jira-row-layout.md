# BRDG-239: Sprint board — Jira-style headerless row layout

> **Completed.** All acceptance criteria implemented and verified (tests + visual). Scope: main sprint board only (compare/epics/refinement views left on the legacy table row, per PO).

**Status:** Completed
**Priority:** Medium
**Source:** PO request

## Description

As a Product Owner, I want the sprint board to feel like Jira's backlog/sprint list rather than a fixed-column spreadsheet, so that every item on a row is clearly readable and nothing gets clipped, regardless of window width.

Today the board is a true table with sticky column headers (`Key`, `Title`, `Epic`, `SP`, `BV`, …) and fixed `table-layout: fixed` columns. In narrow windows the title and epic chips get truncated and some content no longer fits (see screenshots). The ask is to move to a **headerless, flexible row layout** in the spirit of Jira: no `<thead>`, content laid out left-to-right with sensible priorities, secondary signals cleaned up or moved into the existing hover card.

### Reference

- **Current** (Image 1): table with column heads, fixed columns, truncation issues.
- **Target feel** (Image 2): Jira sprint list — checkbox, type icon, key, title, subtask icon, epic chip, status, SP, assignee avatar, no column headers.
- **Hover card** (Image 3): the existing `TicketStatusPill` hover card (BRDG-235) already shows SP/BV, Sprint, Epic, Assignee, Creator, Subtasks — the natural home for anything we strip off the row.

### Progress since this draft was written

The board is still a fixed `<table>` (`<thead>`, `tableLayout: fixed`, `MIN_TABLE_WIDTH = 1100`, header-click sorting) — the core restructure below is still open. But two improvements have shipped inside the current table that this story should build on rather than redo:

- **Hover-only checkbox (done).** The bulk-select checkbox is now default-hidden (`opacity-0`) and fades in on row hover, sitting over the leading issue-type icon (`TicketRow.tsx:156-162, 217-228`). In bulk mode a dedicated checkbox gutter shows on every row. The new layout must preserve this exact behaviour.
- **SP/BV are now recognizable (BRDG-240, done).** SP (gauge icon) and BV (goal icon) render via the shared `MetricBadge` component with per-value color ramps — subtle (icon + number) inline, tinted (pill) in the hover card and header totals. This already resolves the "make SP vs BV self-evident" need, so SP/BV no longer have to move into the hover card for legibility reasons; they can stay inline as the proposed layout shows.

## Proposed row layout

Left to right, single flex row that adapts to width:

```
[pill]  Title (flex, truncates last)  ·  [EPIC] [conditional tags]  ·  SP / BV  ·  (assignee avatar)
```

- **Pill** — the existing `TicketStatusPill` (already combines type icon + key + status, with its hover card).
- **Title** — takes the remaining space and is the only element that truncates; it must always have priority for readable width.
- **Epic + conditional tags** — epic chip followed by the toggleable inline tags that only appear when relevant and enabled (flag, refinement, Quality Score, notes, PO readiness, edit-state dot — see resolved decision #1).
- **SP / BV** — story points and business value, compact.
- **Assignee** — avatar, right-aligned.

The grouped sprint headers (the per-sprint stat bar / `GroupStatBar`) stay — those are not column headers and remain useful.

## Resolved decisions

**#1 — Row vs hover card.** *SP/BV stay inline (recognizable via `MetricBadge`, BRDG-240).*
- **Hover-card only (removed from the row entirely):** open-subtasks indicator, pipeline/deploy badges (already present in the hover card), and follow star (must still be **added** to the hover card).
- **Toggleable inline:** flag, refinement indicator (`Gem`), Quality Score badge, notes icon, PO readiness, and edit-state dot (draft/local/conflict) all remain inline tags that the user can show/hide individually (see #2). The hover card always shows the full set regardless of inline toggles.

**#2 — Field customization.** Drop column **reordering**, but **keep show/hide of data elements.** The user can still toggle which inline fields appear on the row (SP/BV, QS, flag, refinement, notes, PO readiness, edit-state dot, epic, assignee). Reorder plumbing (`columnOrder`, drag-to-reorder in `ColumnToggle`) is removed; the visibility plumbing (`visibleColumns`, `DEFAULT_VISIBLE`, saved-view visibility state) is kept and adapted to the new field set. `useColumnWidths` (fixed column widths) is removed.

**#3 — Sorting.** Sorting moves fully to the existing sort dropdown in the `FilterBar` (`SortControls`, `SORT_OPTIONS`). This is the only sort entry point. Header-click sorting (`handleColumnSort`, `SortIndicator`, `COLUMN_SORT_FIELDS`) is removed.

**#4 — Width behaviour.** No horizontal scroll. When space is tight, **title and epic both shrink and inter-element spacing reduces** (rather than only the title truncating). Title and epic compress together; tags/SP/BV/assignee keep their compact size. `MIN_TABLE_WIDTH` (1100px) horizontal-scroll behaviour is removed.

## Implementation sketch

- Replace the `<table>` / `<thead>` / `<td>`-per-column structure in `TicketTable.tsx` and `TicketRow.tsx` with a flex (or CSS grid) row. Keep the `<tbody>`-per-group grouping and `GroupStatBar` headers.
- Remove `theadContent`, `renderHeaderCell`, `ResizeHandle`, `SortIndicator`, `COLUMN_SORT_FIELDS`, `HEADER_LABELS` (and dependent header-click sorting) — superseded by the sort dropdown (#3).
- Move open-subtasks, pipeline/deploy, and follow star off the row into the `TicketStatusPill` hover card (subtasks + pipeline/deploy already present from BRDG-235; **add the follow star**).
- Keep flag, refinement (`Gem`), Quality Score, notes, PO readiness, and edit-state dot as toggleable inline tags (#1); ensure the hover card always shows the full set.
- Adapt the field-customization surface per #2: **keep show/hide** (`ColumnToggle` visibility, `DEFAULT_VISIBLE`, saved-view visibility state) over the new field set; **remove reordering** (`columnOrder`, drag-to-reorder) and `useColumnWidths` (fixed widths).
- Width behaviour per #4: title + epic shrink together and inter-element spacing reduces when space is tight; remove `MIN_TABLE_WIDTH` horizontal scroll.
- Preserve existing behaviours: drag-and-drop row reorder (`SortableTicketRow`, dnd-kit), virtualization for large lists (`useVirtualizer`), row selection / side panel, the hover-only checkbox (default-hidden, fades in over the type icon on hover; dedicated gutter in bulk mode) + shift-range, inline title edit, prefetch-on-hover, keyboard navigation, flagged-row left border, and the `MetricBadge` SP/BV treatment.

## Implementation Plan

**Scope decision (PO):** main sprint board only for now. The shared `TicketRow` (also used by multi-sprint compare, epics list, refinement list) is left untouched; the main board gets a new forked flex row. This isolates all risk to the board.

**Field model.** Always-on row anatomy (not toggleable): pill (type+key+status+readiness), title, epic chip, SP/BV (`MetricBadge`, editable), assignee. New toggleable inline tag set `InlineTagId = "flag" | "refinement" | "quality" | "notes" | "poReadiness" | "editState"` (default all on). `poReadiness` maps onto the pill's existing `showReadiness` segment (no duplicate element).

1. **Hover card: add follow star + full signal set** (`TicketStatusPill.tsx`). Extend `TicketPillHoverData` with `readiness`, `qualityScore`, `notes`, `followed`, `editState`, `refinementNames`; add `onToggleFollow`. Render follow-star control + InfoRows for Readiness/Quality/Notes and a refinement/edit-state footer. (AC #3, #4) — done first so the row can drop these.
2. **New `BoardRow.tsx`** (`BoardRow` + `SortableBoardRow`): single flex `<tr><td>` row. Order: hover checkbox gutter, pill (+editState dot, +Gem when tags on), title (`flex-1 min-w-0 truncate`), epic chip (`min-w-0 truncate shrink`), flag/quality/notes tags, SP/BV, assignee. Drops open-subtasks, pipeline/deploy, follow star. Takes `tags: Set<InlineTagId>` + `hideEpic`. Preserves checkbox/shift-range, inline title edit, prefetch, flagged border, drag listeners, `forwardRef`/`measureElement`. (AC #2, #3, #4, #6, #8)
3. **`TicketTable.tsx` headerless**: remove `<thead>`, `ResizeHandle`, `SortIndicator`, `COLUMN_SORT_FIELDS`, `HEADER_LABELS`/`HEADER_TOOLTIPS`, `SORTABLE_COLUMNS`, `CENTER_COLUMNS`, `handleColumnSort`, `renderHeaderCell`, `theadContent`, `rh`, `colW`, `MIN_TABLE_WIDTH`, `DEFAULT_COLUMN_WIDTHS` import, and props `columnOrder`/`columnWidths`/`onColumnResize`/`onColumnResetWidth`/`onSortChange`. Use `BoardRow`/`SortableBoardRow`. `visibleColumns: Set<ColumnId>` → `visibleTags: Set<InlineTagId>` (+`hideEpic`). Container drops `overflow-x-auto` + `tableLayout:fixed`. Keep virtualization, dnd, grouped tbodies, GroupStatBar, DragOverlay (rewritten to flex cell). (AC #1, #6, #7, #8, #9)
4. **New `BoardFieldToggle.tsx`** over `ROW_FIELDS` (checkbox list, no reorder) + `Reset`. Leaves shared `ColumnToggle` for compare. (AC #5, #7)
5. **`filter-bar-types.ts`**: add `InlineTagId`, `ROW_FIELDS`, `DEFAULT_VISIBLE_TAGS`; `SavedView.columnConfig` → `{ visibleTags: InlineTagId[] }` (old `{visible,order}` kept optional for migration). (AC #5)
6. **`useColumnConfig.ts`**: rewrite to `visible: Set<InlineTagId>` only (drop order/reorder/widths); migrate persisted old `ColumnId[]`→`InlineTagId[]` (`flagged→flag`, `quality→quality`, `notes→notes`) under a new migration key. (AC #5)
7. **`useSprintBoardFilters.ts`**: `visibleColumns`/`handleColumnToggle`/`columnConfig`/`onApplyColumnConfig` + stored-columns default switch to `InlineTagId`. (AC #5)
8. **`SprintBoard.tsx` + `SprintSlots.tsx`**: drop `useColumnWidths`, `columnOrder`, `handleColumnReorder`, reorder/resize props; swap main-board `ColumnToggle` → `BoardFieldToggle`; pass `visibleTags` + `hideEpic` to `TicketTable`. Move `useColumnWidths.ts` (+test) to `deleted/`. (AC #5, #8)
9. **Tests**: rewrite `TicketTable.test.tsx` (no headers, order, GroupStatBar), add `BoardRow.test.tsx`, extend `TicketStatusPill.test.tsx` (follow star + signals), update `useColumnConfig.test.ts` (tags + migration), adjust `SprintBoard.test.tsx`. (AC #11)

**Out of scope / left intact:** `TicketRow.tsx`, `DroppableSprintColumn.tsx`, `MultiSprintView.tsx`, `EpicTicketList.tsx`, `RefinementTicketList.tsx`, `ColumnToggle.tsx` (compare). SP/BV stay inline-editable (preserves current behavior).

## Acceptance Criteria

- [x] The sprint board renders without column headers; rows use a flexible layout that adapts to width.
- [x] Row order is: pill, title, epic + conditional tags, SP/BV, assignee.
- [x] Open-subtasks, pipeline/deploy, and follow star no longer appear on the row; all three are present in the hover card (follow star newly added).
- [x] Flag, refinement, Quality Score, notes, PO readiness, and edit-state dot are inline tags that can be individually shown/hidden; the hover card always shows the full set.
- [x] Field show/hide is retained (over the new field set); column reordering and fixed column widths are removed.
- [x] When space is tight, title and epic shrink together and inter-element spacing reduces; no horizontal scroll and no meaning-hiding clipping at typical PO window widths.
- [x] Sorting works from the sort dropdown (no header-click sorting).
- [x] Drag-and-drop row reorder, virtualization, row selection, bulk-select, inline title edit, and flagged-row styling all still work.
- [x] Grouped sprint headers (`GroupStatBar`) still render.
- [x] Styling follows project guardrails (brand-derived colors, layered/tinted shadows, `transform`/`opacity` transitions only, no `transition-all`, no default Tailwind blue/indigo).
- [x] Tests updated/added for the new row layout and the removal of header-based sorting.

## Technical Notes

### Affected files (preliminary)

| File | Likely change |
|------|---------------|
| `src/components/sprint-board/TicketTable.tsx` | Remove thead/columns/resize/header-sort; switch to flex/grid rows; keep grouping + dnd + virtualization |
| `src/components/sprint-board/TicketRow.tsx` | Replace per-column `<td>` cells with a single flexible row layout |
| `src/components/sprint-board/TicketTableCells.tsx` | Reduce/relocate cell renderers no longer shown inline |
| `src/components/sprint-board/FilterBar.tsx` + `filter-bar-types.ts` | Sorting becomes dropdown-only; reconcile `COLUMNS`/`DEFAULT_VISIBLE`/presets to the new field set (show/hide kept, reorder removed) |
| `src/components/sprint-board/ColumnToggle.tsx` | Keep show/hide over the new field set; remove drag-to-reorder |
| `src/hooks/useColumnWidths.ts` | Remove (fixed column widths no longer apply) |
| `src/components/shared/TicketStatusPill.tsx` | Absorb any fields stripped from the row into the hover card |
| `SprintBoard.tsx` and saved-view plumbing | Reconcile `visibleColumns` / `columnOrder` state |

### Reuse

- `TicketStatusPill` + its hover card (BRDG-235) — already the home for SP/BV, Sprint, Epic, Assignee, Creator, Subtasks.
- `GroupStatBar`, `SortControls`/`SORT_OPTIONS`, `SortableTicketRow`/dnd-kit, `useVirtualizer` — all reused as-is.

## Dependencies

- Builds on BRDG-235 (hover card) as the destination for stripped fields.
- Touches the customizable-columns work (BRDG-071) and saved views — see resolved decision #2 (show/hide kept, reorder removed).
