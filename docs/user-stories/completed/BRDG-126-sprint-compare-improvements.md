# BRDG-126: Sprint Board Compare - UX Improvements

**Status:** Done
**Priority:** Medium

## Description

The sprint board compare view (`MultiSprintView`) works functionally but has several rough edges. This story polishes it into a first-class view: proper drag-to-move between sprints (with Jira sync), a column header stat bar that matches the grouped view, a cleaner sprint selector, and a handful of smaller UX fixes spotted during review.

---

## 1. Drag-and-drop to move tickets between sprints

The current implementation uses `useDraggable` / `useDroppable` from @dnd-kit to visually move rows, but it is unclear whether the `handleDragEnd` actually calls the Jira API to reassign the ticket to the target sprint. This must be verified and implemented correctly.

**Behaviour:**
- Dragging a ticket from the left column and dropping it on the right column moves it to that sprint via `PUT /api/jira/tickets/[key]/sprint`.
- The source column removes the ticket immediately (optimistic update); the target column inserts it at the drop position.
- If the API call fails, the ticket reverts to its original column and an error toast appears.
- A visible drop zone (dashed border, brand tint background) appears on the receiving column when a drag is in flight.
- The drag overlay (ghost card) shows ticket type icon, key, and title - the same data shown in the row.

**No drag within a column** (reorder within a sprint is a separate backlog item). Only cross-column drops trigger a sprint change.

---

## 2. Column header stat bar - match the grouped view style

The compare view column headers currently show raw `status-count-badge` counts (numbers only). The grouped view (`TicketTable`) renders a richer bar:

```
Active Sprint Alpha    12 items  34 pts  [• 5]  [• 3]  2 unpointed
```

Where:
- `12 items` - total ticket count
- `34 pts` - sum of story points (hidden if 0)
- `[• 5]` in blue - in-progress + test count, clickable to filter
- `[• 3]` in green - done count, clickable to filter
- `2 unpointed` - tickets with no story points, clickable to filter

**Extract `GroupStatBar` component:** The inline JSX in `TicketTable.tsx` (lines 552-671) that renders this stat row should be extracted into a shared `src/components/sprint-board/GroupStatBar.tsx` component. Both `TicketTable` and `MultiSprintView` should use this component.

**`GroupStatBar` props:**
```ts
interface GroupStatBarProps {
  tickets: Ticket[];
  label?: string;           // sprint/group name, displayed before the stats
  activeFilter?: "in-progress" | "done" | "unpointed" | null;
  onFilterChange?: (criterion: "in-progress" | "done" | "unpointed" | null) => void;
  collapsible?: boolean;    // show chevron + collapse toggle (for TicketTable group headers)
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

In `MultiSprintView`, each column header uses `GroupStatBar` without collapsible behavior. The label is the sprint name.

---

## 3. Sprint selector - cleaner dropdown

The current dropdown in `MultiSprintView` is an ad-hoc implementation (inline `useState` + search input + list). It should be replaced with the `SprintSelector` component that already exists in `SprintSlots.tsx` (lines 28-127), or that component should be extracted into a shared `src/components/sprint-board/SprintSelector.tsx` so both `SprintSlots` and `MultiSprintView` use the same one.

**Visual improvements for the shared selector:**
- Show sprint status as a colored dot (green = active, blue = future, grey = closed) - this already exists in the SprintSlots version, just needs to be shared.
- Show sprint dates as a secondary line beneath the sprint name.
- Current sprint shown at top, rest sorted: active > future > closed.
- Sprint name is truncated at one line with an ellipsis; full name in a tooltip.
- The trigger button shows the active sprint name (not just a generic label) with a chevron icon.

---

## 4. Additional UX improvements

### 4a. Show ticket points and assignee in compare rows
The `DraggableTicketRow` in `MultiSprintView` is a lightweight custom component that only shows type icon, key, title, and status. It should additionally show:
- Story points (right-aligned, dimmed when null)
- Assignee avatar (rightmost column)

This aligns with what the main sprint board shows and gives the user enough context to decide which sprint a ticket belongs in.

### 4b. Empty state per column
When a sprint has no tickets (e.g. the user selects a future sprint with no assignments), show a centered empty state message: "No tickets in this sprint" with a subtle icon. Currently the column is just blank.

### 4c. Sticky column headers
The sprint name / stat bar header should remain sticky at the top of each column when the ticket list is long enough to scroll. Use `position: sticky; top: 0` with a proper background so it does not bleed through rows.

### 4d. Search/filter per column
Each column currently has a search input (lines show `<input ... placeholder="Search...">`). Verify it is wired correctly and filters on ticket key, title, and assignee. If not, fix it.

---

## 5. Dedicated URL for compare view

The compare view must be accessible via a stable, shareable URL so the user can bookmark or deep-link to a specific sprint comparison. The URL must also allow navigating back to the normal sprint board via the nav menu.

**URL pattern:** `/sprint-board/compare?left=<sprintId>&right=<sprintId>`

**Behaviour:**
- When the user opens the compare view from the sprint board, the browser navigates to `/sprint-board/compare?left=...&right=...` (using `router.push`) instead of toggling local state.
- The compare page (`src/app/(app)/sprint-board/compare/page.tsx`) renders `MultiSprintView` directly, reading `left` and `right` from `searchParams`.
- Switching sprints inside the compare view updates the URL via `router.replace` so the back button works correctly.
- The "Close compare" button navigates back to `/sprint-board` (or `router.back()`).
- The sprint board nav menu item always links to `/sprint-board`. When the user is on `/sprint-board/compare`, clicking the nav item returns them to the base sprint board.
- `SprintBoard.tsx` no longer needs `compareMode` state; the "Compare" button calls `router.push(...)` instead of `setCompareMode(true)`.

---

## Implementation Plan

### Execution order

A (extract shared components) → B (integrate into MultiSprintView + URL routing) → C (tests)

- [x] Extract `SprintSelector` from `SprintSlots.tsx` into `src/components/sprint-board/SprintSelector.tsx`; update `SprintSlots` to import from there
- [x] Extract `GroupStatBar` from `TicketTable.tsx` into `src/components/sprint-board/GroupStatBar.tsx`; update `TicketTable` to import from there
- [x] Create `src/app/(app)/sprint-board/compare/page.tsx` that reads `left`/`right` search params and renders `MultiSprintView`
- [x] Remove `compareMode` state from `SprintBoard.tsx`; replace the compare button with `router.push('/sprint-board/compare?left=...&right=...')`; remove the early-return that renders `MultiSprintView`
- [x] Update `MultiSprintView` to accept optional `onSprintChange` callback (for URL sync); switching a sprint calls `router.replace` via this callback
- [x] Replace the inline `<select>` in `MultiSprintView` with the shared `SprintSelector`
- [x] Use `GroupStatBar` in each `DroppableSprintColumn` header in `MultiSprintView`; wire `onFilterChange` to a per-column filter state
- [x] Verify `handleDragEnd` in `MultiSprintView` calls `POST /api/jira/move-sprint` with the target sprint ID; implement if missing; add optimistic update + error revert
- [x] Add story points and assignee avatar to `DraggableTicketRow` in `MultiSprintView` (already present — verified)
- [x] Add proper empty state to `DroppableSprintColumn` when ticket list is empty
- [x] Make column headers sticky (fix semi-transparent background so scrolled rows do not bleed through)
- [x] Per-column search: move search input into each column header; extend filter to include assignee name
- [x] Write tests: `GroupStatBar.test.tsx` (stat counts, filter callbacks), `SprintSelector.test.tsx` (search, selection)
- [x] Run `npm run lint && npm run typecheck && npm run test && npm run build`

## Acceptance Criteria

- Compare view is reachable at `/sprint-board/compare?left=<id>&right=<id>` and can be bookmarked / deep-linked
- Switching sprints within the compare view updates the URL via `history.replaceState` so the back button works
- The "Close compare" button returns to `/sprint-board`
- The sprint board nav menu item links to `/sprint-board`; navigating there from the compare view works correctly
- Dragging a ticket from one compare column to the other moves it to the target sprint in Jira; the UI updates optimistically and reverts on error
- Each compare column header shows the same stat bar format as the grouped view: items count, total pts, colored in-progress badge, colored done badge, unpointed badge
- Clicking a stat badge filters the column to show only matching tickets; clicking again clears the filter
- Both `MultiSprintView` and `SprintSlots` use the same `SprintSelector` component
- Sprint selector shows sprint status dots and sprint dates; the trigger button shows the active sprint name
- Draggable rows in compare view show type icon, key, title, story points, and assignee avatar
- Empty sprint columns show a clear empty state message
- Column headers stay sticky when scrolling within a column
- Per-column search filters on key, title, and assignee
- All existing tests pass; new unit tests cover `GroupStatBar` and `SprintSelector`
