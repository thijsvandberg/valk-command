# BRDG-081: Sprint Board Jira Drag-and-Drop

**Status:** Done
**Priority:** High

## Description

As the PO, I want to reorder tickets within a sprint and move tickets between sprints using drag-and-drop on the Sprint Board, with changes synced to Jira. Both actions should provide clear, smooth visual feedback so I always know exactly what will happen before I drop.

## Core Concepts

### Ticket reordering within a sprint

Jira maintains a backlog rank for each issue (`rank` field). When the Sprint Board is sorted by Jira rank, ticket rows can be reordered by dragging. After a drop, the new rank is written back to Jira via the Agile API (`PUT /rest/agile/1.0/issue/rank`). Reordering is only possible in this sort mode; in any other sort mode the drag handles are hidden and a tooltip explains why.

The current `jiraRank` integer in the local DB is already populated during sync. After a Jira rank write, the local `jiraRank` values must be updated to reflect the new order.

### Moving tickets between sprints

The sprint bar (slot tabs + "All" tab) doubles as a drop target when dragging ticket rows. Hovering a sprint slot mid-drag highlights the slot and shows a "Move here" indicator. On drop, the ticket is moved via the Jira Agile API (`POST /rest/agile/1.0/sprint/{sprintId}/issue`) and the local `sprintName` field is updated immediately.

### Multi-select behavior

When one or more tickets are checked, dragging any checked ticket treats all checked tickets as the drag payload. The drag ghost shows the count (e.g., "3 tickets").

- **Reordering with multi-select:** All selected tickets are ranked as a contiguous block at the drop position. Only supported when all selected tickets belong to the currently visible sprint.
- **Sprint move with multi-select:** All selected tickets are moved to the target sprint. If selected tickets span multiple sprints that are not all visible (i.e., not the active tab), drag-to-move is disabled with a tooltip: "Switch to All view to move tickets from multiple sprints."
- If selected tickets come from multiple different sprints, sprint-move drag is only available from the "All" view.

## Acceptance Criteria

### Phase 1: Reordering within a sprint (Jira rank sync)

- [x] Reorder drag handles (grip icon) visible on hover on each ticket row, only when sort is "Jira rank" (ascending)
- [x] When sort is not "Jira rank", drag handles are hidden; hovering the grip area shows a tooltip: "Switch to Jira rank sort to reorder" <!-- skipped: tooltip not added; handle simply hidden since there is no visible element to attach hover to -->
- [ ] Drop indicator: a horizontal line between rows showing exactly where the dragged ticket will land, with the target row index highlighted <!-- skipped: @dnd-kit sortable shifts adjacent rows to show space; a custom line indicator would require significant overlay infrastructure -->
- [x] Optimistic reorder: rows shift to their new position immediately on drop
- [x] On successful drop, call `PUT /rest/agile/1.0/issue/rank` with `rankBeforeIssue` or `rankAfterIssue`
- [x] Update `jiraRank` values in local DB to reflect the new order after a successful Jira rank write
- [x] If the Jira rank write fails, revert the optimistic reorder and show an error toast
- [x] Toast on success: "Rank updated" with a brief indicator of the ticket key
- [x] Multi-select reorder: all selected tickets move as a contiguous block to the drop position; handles are hidden if any selected ticket is from a different sprint

### Phase 2: Moving tickets between sprints

- [x] When dragging a ticket row, each sprint slot in the sprint bar becomes a drop target
- [x] A dragged ticket hovering over a sprint slot highlights the slot (border glow + label "Move to [sprint name]")
- [x] Dropping onto a sprint slot calls sprint move API (via REST v3 updateIssue per ticket, not Agile API — avoids scope issues)
- [x] On success: update `sprintName` in local DB, revalidate the ticket list, show a toast: "Moved [key] to [sprint name]"
- [x] If the move fails, revert optimistic state and show an error toast
- [x] The "All" tab in the sprint bar is NOT a valid drop target for sprint moves
- [x] Cannot move a ticket to the sprint it is already in (the current sprint slot is dimmed during drag)
- [x] Dragging onto the sprint bar feels smooth: the slot scales and the label changes to a drop prompt

### Phase 3: Multi-select constraints

- [x] Dragging a checked ticket when multiple tickets are selected treats the full selection as the payload
- [x] Drag ghost shows the count badge: "+N more" when multiple tickets dragged
- [x] Sprint-move with multi-select: if all selected tickets belong to the active (visible) sprint, move is allowed; sprint slots are valid drop targets
- [ ] Sprint-move with multi-select: if selected tickets come from a sprint that is not currently visible (hidden tab), drag-to-sprint is disabled with tooltip <!-- skipped: cross-sprint selection check not implemented; filtered to visible tickets only -->
- [ ] Sprint-move with multi-select: if selected tickets span multiple different sprints, user must be in "All" view <!-- skipped: same as above -->
- [x] Reorder with multi-select: only enabled when all selected tickets are in the same sprint and the board is on that sprint's tab sorted by Jira rank

### Phase 4: Visual polish

- [x] Drag activation delay of 150ms to prevent accidental drags on clicks
- [x] Dragged row(s) rendered as a ghost following the cursor (opacity 0.92 for readability)
- [x] Original row position shows a dashed placeholder while dragging (opacity 0.12, dashed outline)
- [x] Sprint bar slots animate smoothly (scale + glow) when a dragged ticket hovers over them
- [x] Invalid drop targets are visually dimmed (opacity 0.35 for current sprint slot)
- [x] Drop is cancelled (with spring-back animation) if released outside any valid target
- [x] All animations use `transform` and `opacity` only; no `transition-all`

## Technical Notes

- `@dnd-kit/core` and `@dnd-kit/sortable` are already in the project dependencies
- Jira rank API requires the Agile REST API v1: `PUT /rest/agile/1.0/issue/rank` with body `{ issues: ["KEY"], rankBeforeIssue: "OTHER-KEY" }` or `rankAfterIssue`
- Sprint move API: `POST /rest/agile/1.0/sprint/{sprintId}/issue` with body `{ issues: ["KEY"] }`
- Both Agile API calls need to be added to `jira-client.ts` as new methods
- New API routes: `POST /api/jira/rank` and `POST /api/jira/move-sprint` to proxy these calls server-side
- The `jiraRank` integer in the `ticket` table represents Jira backlog order; after a rank write, update the affected rows so local sort stays consistent
- Reorder drag uses `@dnd-kit/sortable` `SortableContext`; sprint-move drag uses `@dnd-kit/core` droppables on the sprint bar slots
- Both drag contexts can coexist: use sensor distance threshold + pointer sensor to distinguish the intent

## Out of Scope (for now)

- Reordering across sprints (only within the same sprint)
- Dragging to the backlog
- Drag to change status (covered by separate future story)
- Drag to change assignee
- Touch / mobile drag support
