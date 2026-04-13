# BRDG-082: Sprint Board All-View Grouping and Drag-and-Drop

**Status:** Open
**Priority:** High

## Description

As the PO, I want the Sprint Board "All" tab to support grouping by sprint or epic, with clear visual separation between groups, and full drag-and-drop support so I can reorder tickets within a group and move them between sprints directly in this view. Drag should work by grabbing the row anywhere, not only via the handle icon.

Additionally, the horizontal scroll on the sprint board overview must be fixed so the board is fully usable at any viewport width.

## Acceptance Criteria

### Phase 1: Grouping in the All view

- [ ] A "Group by" control in the Sprint Board toolbar, visible only when the "All" tab is active
- [ ] Options: None, Sprint, Epic
- [ ] Default: None (existing flat list behaviour is unchanged)
- [ ] When "Group by Sprint" is selected, tickets are grouped by their `sprintName`; tickets with no sprint fall into a "No sprint" group at the bottom
- [ ] When "Group by Epic" is selected, tickets are grouped by their epic link; tickets with no epic fall into a "No epic" group at the bottom
- [ ] Group order: active sprint first, then future sprints chronologically, then past sprints, then "No sprint"
- [ ] Group selection persists per-session (localStorage, not DB); resets on hard refresh

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

- [ ] Dragging works when grabbing anywhere on the ticket row, not only via the grip handle icon
- [ ] The grip handle icon remains visible on hover as a visual affordance, but is no longer the sole activation target
- [ ] `cursor: grab` is applied to the full row on hover when drag is enabled; `cursor: grabbing` while dragging
- [ ] Click and selection interactions on the row still work normally (drag activation requires the 150 ms delay already in place)
- [ ] Links, buttons, checkboxes, and input fields inside the row are excluded from drag activation (pointer-events still handled by those elements)

### Phase 5: Fix horizontal scroll on sprint board overview

- [ ] The sprint board table never overflows the viewport horizontally without a visible scrollbar
- [ ] A horizontal scrollbar appears at the bottom of the table container (not on the `body`) when column content is wider than the available space
- [ ] The table header row scrolls horizontally together with the body (no header/body misalignment)
- [ ] The sticky leftmost columns (ticket key, title) remain fixed during horizontal scroll
- [ ] No content is clipped or hidden at any viewport width >= 1024px

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
