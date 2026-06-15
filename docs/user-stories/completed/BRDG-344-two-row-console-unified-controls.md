# BRDG-344: Two-Row Console — Unified Controls + Two-Pane Filter Dropdown

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want the sprint board's three stacked bars (header, views/sprint, filter) reduced to two — with search, sort and filter living in one "unified controls" cluster, and the row display settings folded into the filter dropdown — so the board chrome is calmer and hands more height back to the ticket list, without losing any control I have today.

Today the chrome is three full-width rows: the fixed header (`ViewHeader`), the views/sprint bar (`SprintSlots`), and a separate filter bar (`FilterBar`) with eight inline filter dropdowns, a search field, a clear button and a save-view button. The filter row is the busiest and tallest. This story removes the dedicated filter bar: its search, sort affordance and filters collapse into a single controls cluster on the right of the views bar, and the eight filter dropdowns become one combined **two-pane dropdown** (category rail + options). The display / field-visibility menu (`BoardFieldToggle`) moves behind a button inside that dropdown's header.

**Terminology:** the visibility toggles (Flag, Refinement, QS, Notes, PO readiness, Edit state, SP, BV, Epic, Assignee) are **display / row-field settings**, not table columns — the board is headerless (BRDG-239), so these control which inline fields render per row. They are labelled **"Display"** in the UI, even though the underlying state remains `columnConfig.visibleTags` in code.

**Chosen direction.** Decided with the PO over two explorations: `/dev/exploration/board-chrome` (the broad "three bars as one console" study) narrowed to the two-row console, then `/dev/exploration/two-row-console` built it out as **unified controls + a two-pane filter dropdown**. Both pages are the visual reference for this story.

## Context

- **Three bars today:**
  - `src/components/shared/ViewHeader.tsx` — fixed top header (wordmark menu, sprint context, completion meter, notifications). The redundant hamburger glyph has **already been removed** (the `bridge_` wordmark is the sole menu trigger); this story does not touch the header further.
  - `src/components/sprint-board/SprintSlots.tsx` — views bar: `All` pill, `Backlogs` dropdown, sprint pills, and a right-side tool group (`SavedViewsMenu`, sort label + toggle, `GroupByDropdown`, collapse button, `BoardFieldToggle`, `SortDropdown`, filter toggle).
  - `src/components/sprint-board/FilterBar.tsx` — the third row to be retired: `ExpandableSearch` + eight `FilterDropdown`s (Status, Epic, Assignee, Readiness, Changes, Type, Gaps, Team, Sprint) + `Clear` + `SaveViewPopover`.
- **Filter dropdowns are already searchable + badge-styled.** `src/components/shared/FilterDropdown.tsx` supports `searchable`, `renderOption`, `leadingOptions` (the sprint "By state" section) and a count badge. `FilterBar` passes styled `renderOption`s: `StatusOption`, `EpicBadge`, `ReadinessOption`, `IssueTypeOption`, `Avatar` (assignee), colored dots (Changes/Gaps). These must carry over verbatim into the combined panel.
- **Sort already has a dropdown.** `src/components/sprint-board/SortControls.tsx` (`SortDropdown`) lists `SORT_OPTIONS` (`filter-bar-types.ts`) with an asc/desc arrow on the active field and a reset. Behaviour is good as-is — only its trigger relocates into the cluster.
- **Display / field-visibility menu.** `src/components/sprint-board/BoardFieldToggle.tsx` toggles `ROW_FIELDS` (`filter-bar-types.ts`), split into `signal` and `badge` groups (divider between them) with a reset to `DEFAULT_VISIBLE_TAGS`. This is the menu in the PO's reference screenshot — row-display fields, not table columns — to be surfaced under the label "Display".
- **Search.** `src/components/sprint-board/ExpandableSearch.tsx` is the icon-that-expands-to-a-field control, today at the start of the filter bar.
- **Saved views serialize filters + sort + display.** `SavedView` (`filter-bar-types.ts`) and `useSprintBoardFilters.ts` already persist `filters`, `sort`, and `columnConfig.visibleTags`; the combined panel must read/write the same state so saved views keep working (see BRDG-343).
- **Positioning precedent.** BRDG-312 added collision-aware picker positioning; the combined dropdown must stay within the viewport on narrow widths.

## Implementation Plan

1. **Extract `BoardFieldList`** from `BoardFieldToggle.tsx` — the `ROW_FIELDS` checkbox list (signal/badge divider) + `Reset to default`, as a standalone exported component. `BoardFieldToggle` (the standalone bar button) keeps consuming it for back-compat but is no longer rendered on the bar.
2. **New `FilterControlsPanel.tsx`** — the two-pane dropdown. Owns: active category, per-category search text (reset on category switch), and a `view: "filters" | "display"` switch. Built from a generic `FilterCategory[]` descriptor array assembled from the live props, each carrying the **verbatim `renderOption`** lifted from `FilterBar` (StatusOption, EpicBadge, Avatar+userInitials/userColor, ReadinessOption, EDIT_STATE_OPTIONS dot, IssueTypeOption, GAPS_OPTIONS dot, sprint labelMap), plus `searchable`/`leadingOptions`/`leadingLabel`. Sprint/Team/Gaps stay conditional (Sprint only in All view; Team only when options exist). Carries the assignee-favorites SWR (`/api/jira/assignable-users`) so favourite ordering is preserved. Rail: per-category brand dot + count; header: total count + `Display` toggle + `Clear all` (filters only). Display view renders `BoardFieldList` with its own `Reset`. Reuses shared `Checkbox`.
3. **New `UnifiedControlsCluster.tsx`** — the ringed segment group: `ExpandableSearch` (leading, unchanged) · `SortDropdown` trigger (middle, unchanged) · `FilterControlsPanel` trigger (filter, with total-count badge). Owns the single open-segment state and `useOutsideClick([trigger, panel], …, { escapeClose: true })` so the panel closes on outside-click and Escape. Filter panel positioned `absolute right-0` (opens leftward from the right edge; collision-safe) with a viewport `max-width` guard.
4. **Wire `SprintSlots.tsx`** — drop the standalone filter-toggle `Button`, `BoardFieldToggle`, and standalone `SortDropdown`; render `<UnifiedControlsCluster>` in the right tool group. Add the cluster's props to the interface; remove `filtersCollapsed`/`onToggleFilters` (filter is now a dropdown, not a collapsible row). `SavedViewsMenu`, active-sort label, `GroupByDropdown`, collapse-all stay (out of scope).
5. **Wire `SprintBoard.tsx`** — remove the `{!barsCollapsed && <FilterBar/>}` block and the now-dead `barsCollapsed` state; pass the 9 filter sets + setters + `*Options` + `sprintNameMap` + `searchQuery`/`setSearchQuery` + `resetFilters` (filters-only clear, verified) + `activeFilterCount` into `SprintSlots`→cluster. Sprint props spread only when `isAllView`.
6. **Retire `FilterBar` render path** — keep `FilterBar.tsx` as the re-export barrel (many files import `SORT_OPTIONS`, `ROW_FIELDS`, types, `SortDropdown`, `BoardFieldToggle` from it); simply stop rendering the component. No re-export removed.
7. **Tests** — `FilterControlsPanel.test.tsx` (category switch, per-category search + reset, badge rendering, selection toggle, rail/header counts, sprint leading options, Display swap, Clear-all-filters-only, Reset-fields-only), `UnifiedControlsCluster.test.tsx` (search expand/collapse/clear, one-open-at-a-time, outside-click + Escape, sort brand dot), update `SprintSlots.test.tsx` (toggle button + BoardFieldToggle gone, cluster present). Full suite + build at the end.

**Decisions taken:** keep the bar's active-sort label (out of scope to remove); use `absolute right-0` positioning over portal; Display view uses the real signal/badge divider layout (not the exploration's two-column grid); `SavedViewsMenu` remains the save/delete entry point — the cluster does not re-add a separate SaveViewPopover.

## Acceptance Criteria

### Chrome → two rows
- [x] The dedicated filter bar row is removed. Sprint-board chrome is two rows: header + views/toolbar.
- [x] The views bar's right side carries one **unified controls cluster** (a single segmented/ringed group): **search · sort · filter**, alongside the existing `Saved` views menu.

### Search
- [x] `ExpandableSearch` behaviour is folded into the cluster as the leading segment — the icon expands inline to a field, and collapses/clears on close. No separate search control remains on the bar.

### Sort (behaviour unchanged)
- [x] The cluster's sort segment opens the existing `SortDropdown` (field list + asc/desc on the active field + reset). A brand dot marks the trigger when a non-default sort is active.

### Filter → two-pane dropdown
- [x] The cluster's filter segment opens a **two-pane dropdown** — a category rail (Status, Epic, Assignee, Readiness, Changes, Type, Gaps, Team, Sprint) on the left, the selected category's options on the right.
- [x] **Per-category search is preserved** where it exists today (Epic, Assignee, Sprint): a search field in the options pane filters that category.
- [x] **Option badge styling is preserved verbatim** (`StatusOption`, `EpicBadge`, `ReadinessOption`, `IssueTypeOption`, assignee `Avatar`, Changes/Gaps colored dots).
- [x] The Sprint category keeps its leading "By state" options (active / future / closed).
- [x] The rail shows a per-category active indicator + count; the header shows the total active count.

### Display settings behind a header button
- [x] The filter dropdown header has a **`Display`** toggle button that swaps the panel body to the row field-visibility settings (`ROW_FIELDS`, signal/badge groups, divider) with a `Reset to default`. Labelled "Display", not "Columns" (headerless board → row fields, not table columns). The standalone `BoardFieldToggle` button is removed from the bar.
- [x] The header's `Clear all` clears **filters only**; the display view's `Reset` resets **field visibility only**. The two are independent.

### No loss of function
- [x] Every filter, the sort, search, save-view, and display/field toggles available today remain reachable. Saved views continue to round-trip filters + sort + field visibility (`columnConfig.visibleTags`).
- [x] The dropdown is collision-aware (stays within the viewport, opens from the right without clipping) and closes on outside-click / Escape.
- [x] Tests cover the combined two-pane panel (category switch, per-category search, badge rendering, selection toggle, counts), the display view toggle + reset, the search expand/collapse, and that saved views still serialize/restore the same state.

## Technical Notes

- **New combined panel component** (e.g. `FilterControlsPanel`) replacing the eight inline `FilterDropdown` instances in the views-bar context. It owns: active category, per-category search text, and a `view: "filters" | "display"` switch. It composes the same state `FilterBar`, `SortDropdown` and `BoardFieldToggle` use today — no new persistence.
- **Reuse the option rows:** keep the `renderOption` callbacks and `leadingOptions`/`labelMap` semantics from `FilterBar.tsx` so badges and the sprint "By state" section are identical. Reuse the shared `Checkbox` and `useOutsideClick`.
- **Search:** lift `ExpandableSearch` into the cluster; keep its `value`/`onChange` wiring (`searchQuery` / `onSearchChange`) intact.
- **Sort:** relocate the `SortDropdown` trigger into the cluster; the component itself is unchanged.
- **Display:** render `BoardFieldToggle`'s content (the `ROW_FIELDS` groups + reset) inside the panel's display view rather than as a standalone bar button; keep `visibleTags` state and the `DEFAULT_VISIBLE_TAGS` reset. Surface under the label "Display".
- **Bar wiring:** `SprintSlots.tsx` drops the separate filter toggle + `BoardFieldToggle` button and gains the cluster; `FilterBar.tsx` is either retired or reduced to the panel body it now feeds. Confirm the `SprintBoard` page no longer renders the third bar row.
- Keep the brand-tinted active treatment consistent with the live board (active controls use `text-[var(--color-brand-600)]` on a brand tint).

## Decisions (to resolve before implementation)

- **Search placement in the cluster:** leading segment of the ring that expands inline (as in the exploration) **vs** a persistent compact field. Recommendation: leading expandable segment (matches today's `ExpandableSearch`, keeps the cluster tight).
- **Combined panel vs keep-per-dropdown:** one two-pane panel (chosen) **vs** retaining individual `FilterDropdown`s behind a single trigger. The two-pane panel is the chosen direction; verify it does not regress the per-category search UX for long lists (Epic/Assignee).
- **"Display" label wording:** "Display" (chosen) vs alternatives like "Fields" / "Show". Open to a final call from the PO.
- **Saved-view migration:** none expected (same serialized shape), but confirm `columnConfig.visibleTags` and `sort` still restore correctly through the relocated controls.

## Out of scope

- The broader board-chrome surface restyle (unified slab / floating clusters / editorial rail / brand spine from `/dev/exploration/board-chrome`) — a separate visual direction, not part of this story.
- Header bar (`ViewHeader`) restyle. The hamburger removal already shipped; no further header changes here.
- The `GroupByDropdown` and group collapse/expand controls — left as-is on the bar unless trivially co-located with the cluster.
- Any change to filtering logic, saved-view storage (covered by BRDG-343), or the board row layout.
- The nav-menu "Explorations" → "Explore" rename (already shipped, unrelated to the board chrome).

## Dependencies

- Builds on the views bar (BRDG-319), the headerless row + column config / inline tags (BRDG-239), the field-visibility toggle (BRDG-299 → `BoardFieldToggle`), collision-aware positioning (BRDG-312), and the saved-views state (BRDG-343).
- Visual reference: `/dev/exploration/two-row-console` (chosen: unified controls + two-pane) and `/dev/exploration/board-chrome`.
