# BRDG-239: Sprint board — Jira-style headerless row layout (DRAFT)

> **DRAFT — needs further refinement.** The direction is agreed; several decisions are still open (marked **OPEN** below). Do not implement until these are resolved with the PO.

**Status:** Draft
**Priority:** Medium
**Source:** PO request

## Description

As a Product Owner, I want the sprint board to feel like Jira's backlog/sprint list rather than a fixed-column spreadsheet, so that every item on a row is clearly readable and nothing gets clipped, regardless of window width.

Today the board is a true table with sticky column headers (`Key`, `Title`, `Epic`, `SP`, `BV`, …) and fixed `table-layout: fixed` columns. In narrow windows the title and epic chips get truncated and some content no longer fits (see screenshots). The ask is to move to a **headerless, flexible row layout** in the spirit of Jira: no `<thead>`, content laid out left-to-right with sensible priorities, secondary signals cleaned up or moved into the existing hover card.

### Reference

- **Current** (Image 1): table with column heads, fixed columns, truncation issues.
- **Target feel** (Image 2): Jira sprint list — checkbox, type icon, key, title, subtask icon, epic chip, status, SP, assignee avatar, no column headers.
- **Hover card** (Image 3): the existing `TicketStatusPill` hover card (BRDG-235) already shows SP/BV, Sprint, Epic, Assignee, Creator, Subtasks — the natural home for anything we strip off the row.

## Proposed row layout

Left to right, single flex row that adapts to width:

```
[pill]  Title (flex, truncates last)  ·  [EPIC] [conditional tags]  ·  SP / BV  ·  (assignee avatar)
```

- **Pill** — the existing `TicketStatusPill` (already combines type icon + key + status, with its hover card).
- **Title** — takes the remaining space and is the only element that truncates; it must always have priority for readable width.
- **Epic + conditional tags** — epic chip followed by tags that only appear when relevant (flag, refinement, subtasks, etc. — see **OPEN #1**).
- **SP / BV** — story points and business value, compact.
- **Assignee** — avatar, right-aligned.

The grouped sprint headers (the per-sprint stat bar / `GroupStatBar`) stay — those are not column headers and remain useful.

## Open decisions (to resolve before implementation)

**OPEN #1 — Row vs hover card.** Which secondary signals stay as conditional inline tags on the row (only shown when applicable), and which move entirely into the hover card? Candidates currently on the row: flag, refinement indicator (`Gem`), open-subtasks indicator, Quality Score badge, notes icon, pipeline/deploy badges, PO readiness, edit-state dot (draft/local/conflict), follow star. The PO's note: "misschien het eea opschonen en enkel tonen in de ticket tooltip."

**OPEN #2 — Column customization.** The board currently supports show/hide + reorder of columns (`ColumnToggle`, `useColumnWidths`, `COLUMNS`, `DEFAULT_VISIBLE`, saved views). With a fixed Jira-style layout this largely disappears. Decide: drop the toggle entirely for one clean fixed layout, or keep a reduced set of optional fields (e.g. toggle SP/BV/QS). This affects saved views and the `visibleColumns`/`columnOrder` plumbing throughout `SprintBoard → TicketTable → TicketRow`.

**OPEN #3 — Sorting.** Sorting is currently triggered by clicking column headers (`handleColumnSort`, `SortIndicator`). With no headers, sorting must move fully to the existing sort dropdown in the `FilterBar` (`SortControls`, `SORT_OPTIONS` already exist). Confirm this is the only sort entry point.

**OPEN #4 — Width behaviour.** Today below `MIN_TABLE_WIDTH` (1100px) the table scrolls horizontally. With a flex layout we instead want graceful degradation (title truncates, tags hide) and no horizontal scroll. Confirm the responsive priority order when space is tight (likely: pill > title > SP/BV > assignee > epic > tags).

## Implementation sketch (non-binding, pending OPEN items)

> Filled in only enough to scope the work. Finalize after the OPEN decisions.

- Replace the `<table>` / `<thead>` / `<td>`-per-column structure in `TicketTable.tsx` and `TicketRow.tsx` with a flex (or CSS grid) row. Keep the `<tbody>`-per-group grouping and `GroupStatBar` headers.
- Remove `theadContent`, `renderHeaderCell`, `ResizeHandle`, `SortIndicator`, `COLUMN_SORT_FIELDS`, `HEADER_LABELS` (and dependent header-click sorting) — superseded by the sort dropdown.
- Re-home stripped fields into the `TicketStatusPill` hover card (mostly already present from BRDG-235), adding any missing ones.
- Preserve existing behaviours: drag-and-drop reorder (`SortableTicketRow`, dnd-kit), virtualization for large lists (`useVirtualizer`), row selection / side panel, checkbox bulk-select + shift-range, inline title edit, prefetch-on-hover, keyboard navigation, flagged-row left border.
- Reconcile or remove the column-customization surface per **OPEN #2** (`ColumnToggle`, `useColumnWidths`, `DEFAULT_VISIBLE`, `COLUMN_PRESETS`, saved-view column state).

## Acceptance Criteria (draft — expand after OPEN items)

- [ ] The sprint board renders without column headers; rows use a flexible layout that adapts to width.
- [ ] Row order is: pill, title, epic + conditional tags, SP/BV, assignee.
- [ ] The title is the element that absorbs/yields space; no content is clipped in a way that hides its meaning at typical PO window widths.
- [ ] Secondary signals are either shown as clearly-meaningful conditional tags on the row or surfaced in the hover card (per OPEN #1).
- [ ] Sorting works from the sort dropdown (no header-click sorting).
- [ ] Drag-and-drop reorder, virtualization, row selection, bulk-select, inline title edit, and flagged-row styling all still work.
- [ ] Grouped sprint headers (`GroupStatBar`) still render.
- [ ] Styling follows project guardrails (brand-derived colors, layered/tinted shadows, `transform`/`opacity` transitions only, no `transition-all`, no default Tailwind blue/indigo).
- [ ] Tests updated/added for the new row layout and the removal of header-based sorting.

## Technical Notes

### Affected files (preliminary)

| File | Likely change |
|------|---------------|
| `src/components/sprint-board/TicketTable.tsx` | Remove thead/columns/resize/header-sort; switch to flex/grid rows; keep grouping + dnd + virtualization |
| `src/components/sprint-board/TicketRow.tsx` | Replace per-column `<td>` cells with a single flexible row layout |
| `src/components/sprint-board/TicketTableCells.tsx` | Reduce/relocate cell renderers no longer shown inline |
| `src/components/sprint-board/FilterBar.tsx` + `filter-bar-types.ts` | Sorting becomes dropdown-only; reconcile `COLUMNS`/`DEFAULT_VISIBLE`/presets per OPEN #2 |
| `src/components/sprint-board/ColumnToggle.tsx` | Drop or reduce per OPEN #2 |
| `src/hooks/useColumnWidths.ts` | Remove if column widths no longer apply |
| `src/components/shared/TicketStatusPill.tsx` | Absorb any fields stripped from the row into the hover card |
| `SprintBoard.tsx` and saved-view plumbing | Reconcile `visibleColumns` / `columnOrder` state |

### Reuse

- `TicketStatusPill` + its hover card (BRDG-235) — already the home for SP/BV, Sprint, Epic, Assignee, Creator, Subtasks.
- `GroupStatBar`, `SortControls`/`SORT_OPTIONS`, `SortableTicketRow`/dnd-kit, `useVirtualizer` — all reused as-is.

## Dependencies

- Builds on BRDG-235 (hover card) as the destination for stripped fields.
- Touches the customizable-columns work (BRDG-071) and saved views — see OPEN #2.
