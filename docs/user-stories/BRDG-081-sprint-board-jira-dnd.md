# BRDG-081: Sprint Board Jira Drag-and-Drop

**Status:** Open
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

- [ ] Reorder drag handles (grip icon) visible on hover on each ticket row, only when sort is "Jira rank" (ascending)
- [ ] When sort is not "Jira rank", drag handles are hidden; hovering the grip area shows a tooltip: "Switch to Jira rank sort to reorder"
- [ ] Drop indicator: a horizontal line between rows showing exactly where the dragged ticket will land, with the target row index highlighted
- [ ] Optimistic reorder: rows shift to their new position immediately on drop
- [ ] On successful drop, call `PUT /rest/agile/1.0/issue/rank` with `rankBeforeIssue` or `rankAfterIssue`
- [ ] Update `jiraRank` values in local DB to reflect the new order after a successful Jira rank write
- [ ] If the Jira rank write fails, revert the optimistic reorder and show an error toast
- [ ] Toast on success: "Rank updated" with a brief indicator of the ticket key
- [ ] Multi-select reorder: all selected tickets move as a contiguous block to the drop position; handles are hidden if any selected ticket is from a different sprint

### Phase 2: Moving tickets between sprints

- [ ] When dragging a ticket row, each sprint slot in the sprint bar becomes a drop target
- [ ] A dragged ticket hovering over a sprint slot highlights the slot (border glow + label "Move to [sprint name]")
- [ ] Dropping onto a sprint slot calls `POST /rest/agile/1.0/sprint/{sprintId}/issue`
- [ ] On success: update `sprintName` in local DB, revalidate the ticket list for both the source and target sprint, show a toast: "Moved [key] to [sprint name]"
- [ ] If the move fails, revert optimistic state and show an error toast
- [ ] The "All" tab in the sprint bar is NOT a valid drop target for sprint moves
- [ ] Cannot move a ticket to the sprint it is already in (the current sprint slot is dimmed during drag)
- [ ] Dragging onto the sprint bar feels smooth: the slot expands slightly and the label changes to a drop prompt

### Phase 3: Multi-select constraints

- [ ] Dragging a checked ticket when multiple tickets are selected treats the full selection as the payload
- [ ] Drag ghost shows the count badge: "3 tickets" instead of a single ticket preview
- [ ] Sprint-move with multi-select: if all selected tickets belong to the active (visible) sprint, move is allowed; sprint slots are valid drop targets
- [ ] Sprint-move with multi-select: if selected tickets come from a sprint that is not currently visible (hidden tab), drag-to-sprint is disabled; hovering a sprint slot shows "Switch tab to include all selected tickets"
- [ ] Sprint-move with multi-select: if selected tickets span multiple different sprints, the user must be in "All" view; otherwise drop targets are disabled with the same tooltip
- [ ] Reorder with multi-select: only enabled when all selected tickets are in the same sprint and the board is on that sprint's tab sorted by Jira rank

### Phase 4: Visual polish

- [ ] Drag activation delay of 150ms to prevent accidental drags on clicks
- [ ] Dragged row(s) rendered as a ghost with reduced opacity (0.5) following the cursor
- [ ] Original row position shows a dashed placeholder while dragging
- [ ] Sprint bar slots animate smoothly (scale + glow) when a dragged ticket hovers over them
- [ ] Invalid drop targets are visually dimmed (opacity 0.35) during drag
- [ ] Drop is cancelled (with spring-back animation) if released outside any valid target
- [ ] All animations use `transform` and `opacity` only; no `transition-all`

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
