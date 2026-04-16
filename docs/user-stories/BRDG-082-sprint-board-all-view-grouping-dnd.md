# BRDG-082: Sprint Board All-View Grouping and Drag-and-Drop

**Status:** Open
**Priority:** High

## Description

As the PO, I want the Sprint Board "All" tab to support grouping by sprint or epic, with clear visual separation between groups, and full drag-and-drop support so I can reorder tickets within a group and move them between sprints directly in this view. Drag should work by grabbing the row anywhere, not only via the handle icon.

Additionally, the horizontal scroll on the sprint board overview must be fixed so the board is fully usable at any viewport width.

## Implementation Plan

**Recommended implementation order: 5 → 4 → 0 → 1 → 2 → 3** (Phases 4 and 5 are independent of grouping logic)

1. **Phase 5 first (CSS-only, lowest risk)**: Fix horizontal scroll in `TicketTable.tsx` — add `overflow-x-auto min-w-0` to table container, add sticky column support for drag-handle/checkbox/key columns.

2. **Phase 4 (row-level drag)**: In `TicketRow.tsx` / `SortableTicketRow`, move `{...listeners}` and `{...attributes}` from the handle `<td>` to the `<tr>` element. Add `onPointerDown={e => e.stopPropagation()}` to interactive children (checkbox td, follow star button, POStatusCell td, QualityBadge td). Apply `cursor-grab`/`cursor-grabbing` to `<tr>`.

3. **Phase 0 (foundation hooks/types)**:
   - Create `src/hooks/useSessionStorage.ts` (identical to `useLocalStorage` but using `sessionStorage`)
   - Create `src/components/sprint-board/useGroupBy.ts` with `groupBy` state, `collapsedGroups` state, and `groupTickets()` utility that groups and sorts sprints (active → future chronological → past → "No sprint")

4. **Phase 1 (Group by control)**: Add `groupBy`/`onGroupByChange` props to `SprintSlots.tsx` and render a "Group by" dropdown (None / Sprint / Epic) visible only when `isAllView`. Wire up in `SprintBoard.tsx`.

5. **Phase 2 (Group headers)**: Add `groups`, `collapsedGroups`, `onToggleCollapse` props to `TicketTable.tsx`. When grouped, render one `<tbody>` per group with: spacer `<tr>` (24px), sticky group header `<tr>` with collapse toggle, then ticket rows. Disable virtualization when groups are active.

6. **Phase 3 (Grouped DnD)**: Extend `jiraRankDndEnabled` to include `isAllView && groupBy === "sprint"`. Add per-group `SortableContext` in `TicketTable`. Extend `handleBoardDragEnd` in `SprintBoard.tsx` to detect cross-group drops (by comparing `active.data.current.sprintId !== over.data.current.sprintId`) and call `moveSprint` + `rank`. Register group header droppables. Update DragOverlay to show "Move to [sprint]" when dragging between groups. Restrict epic cross-group drag.

**New files**: `src/hooks/useSessionStorage.ts`, `src/components/sprint-board/useGroupBy.ts`

**Key tricky parts**:
- Multiple `<tbody>` + per-group `SortableContext`: cross-group drag must be handled at DndContext level via collision detection
- Sticky column backgrounds: need explicit opaque bg on sticky `<td>` elements matching all row states
- `onPointerDown` propagation: every interactive element in a row needs stopPropagation to prevent drag-on-click
- Session storage (not localStorage) for group-by state (resets on hard refresh)

## Acceptance Criteria

### Phase 1: Grouping in the All view

- [x] A "Group by" control in the Sprint Board toolbar, visible only when the "All" tab is active
- [x] Options: None, Sprint, Epic
- [x] Default: None (existing flat list behaviour is unchanged)
- [x] When "Group by Sprint" is selected, tickets are grouped by their `sprintName`; tickets with no sprint fall into a "No sprint" group at the bottom
- [x] When "Group by Epic" is selected, tickets are grouped by their epic link; tickets with no epic fall into a "No epic" group at the bottom
- [x] Group order: active sprint first, then future sprints chronologically, then past sprints, then "No sprint"
- [x] Group selection persists per-session (localStorage, not DB); resets on hard refresh

### Phase 2: Group headers and visual separation

- [ ] Each group has a sticky header row that shows: group name, ticket count badge, and a collapse/expand toggle
- [ ] Visual separation between groups uses generous vertical whitespace (at least 24px gap) plus a subtle horizontal rule — not just a thick border
- [ ] Group header background is elevated (e.g. a faint surface tint), clearly distinguishing it from ticket rows without being heavy
- [ ] Collapsed groups show only their header; the ticket count remains visible
- [ ] Collapse state persists per group key in localStorage for the session

### Phase 3: Drag-and-drop within the All view (grouped)

- [ ] When "Group by Sprint" is active and sort is "Jira rank", rows within each group are draggable to reorder (same Jira rank sync as BRDG-081)
- [ ] Dragging a ticket row out of its group and dropping it onto another sprint group moves it to that sprint (calls the sprint move API from BRDG-081)
- [ ] A drop zone appears between groups and inside empty groups during an active drag, making the target visually obvious
- [ ] Moving to a group reorders the ticket to the position it was dropped at within that group, not just appended at the bottom
- [ ] Optimistic update: the row visually moves to the new group immediately; reverts with a toast on API failure
- [ ] When dragging between groups, the ghost shows the ticket key + title and the target group name below it: "Move to [sprint name]"
- [ ] Group headers are NOT draggable; only ticket rows can be dragged
- [ ] When "Group by Epic" is active, cross-group drag is disabled (epics cannot be changed via drag); a tooltip explains why

### Phase 4: Row-level drag activation

- [x] Dragging works when grabbing anywhere on the ticket row, not only via the grip handle icon
- [x] The grip handle icon remains visible on hover as a visual affordance, but is no longer the sole activation target
- [x] `cursor: grab` is applied to the full row on hover when drag is enabled; `cursor: grabbing` while dragging
- [x] Click and selection interactions on the row still work normally (drag activation requires the 150 ms delay already in place)
- [x] Links, buttons, checkboxes, and input fields inside the row are excluded from drag activation (pointer-events still handled by those elements)

### Phase 5: Fix horizontal scroll on sprint board overview

- [x] The sprint board table never overflows the viewport horizontally without a visible scrollbar
- [x] A horizontal scrollbar appears at the bottom of the table container (not on the `body`) when column content is wider than the available space
- [x] The table header row scrolls horizontally together with the body (no header/body misalignment)
- [x] The sticky leftmost columns (ticket key, title) remain fixed during horizontal scroll
- [x] No content is clipped or hidden at any viewport width >= 1024px

## Technical Notes

- Group headers use a `<tr>` element with `colspan` spanning all visible columns so they integrate with the existing table layout
- Vertical gap between groups: wrap each group in a `<tbody>`; browser-native `<tbody>` spacing via a spacer `<tr>` with `height: 24px` and no borders is the cleanest approach (no CSS hacks)
- For row-level drag activation, replace the current `useDraggable` hook attachment from the handle icon to the row element; pass `{listeners}` and `{attributes}` to the `<tr>` instead of the `<GripIcon>`; keep the icon rendered for visual affordance only
- Exclude interactive children from drag by checking `event.target` in the drag start sensor's `activationConstraint` or by adding `onPointerDown={(e) => e.stopPropagation()}` to interactive child elements
- Horizontal scroll fix: ensure the table wrapper has `overflow-x: auto` and `min-width: 0`; ensure sticky columns use `position: sticky; left: 0; z-index: 2` with a solid background matching the row surface (otherwise content bleeds through on scroll)
- Group-by state: store in a `useSprintBoardSettings` hook alongside existing sort/filter state; no DB change needed

## Out of Scope

- Drag-and-drop reordering when grouped by epic (epics are managed in Jira, not here)
- Multi-sprint group collapse/expand shortcuts
- Touch/mobile drag support
