# BRDG-049: Sprint Board Drag-and-Drop

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to drag tickets between status columns on the Sprint Board and have the change reflected locally (with optional push to Jira) so I can quickly reorganize during standups.

## Acceptance Criteria

### Phase 1: Drag-and-drop infrastructure
- [ ] Use existing @dnd-kit dependency for drag-and-drop on the Sprint Board
- [ ] Enable drag on ticket rows in table view
- [ ] Define drop zones mapped to Jira status columns (To Do, In Progress, In Review, Done)
- [ ] Visual drag preview showing ticket key and title

### Phase 2: Local status update
- [ ] On drop, update the ticket's status locally in the database
- [ ] Optimistic UI update (instant visual feedback)
- [ ] Show a toast: "Moved VALK-42 to In Progress"
- [ ] Undo action in the toast (reverts to previous status)

### Phase 3: Jira push (optional)
- [ ] After local update, show option to push status change to Jira
- [ ] "Push to Jira" button in the toast or a batch push action
- [ ] If push fails, show error but keep local change
- [ ] Activity log entry for status changes (local and pushed)

### Phase 4: Kanban column view
- [ ] Alternative Sprint Board view: Kanban columns (one per status)
- [ ] Drag tickets between columns
- [ ] Column headers with ticket count and total points
- [ ] Toggle between table view and kanban view

## Technical Notes

- @dnd-kit already in dependencies; use `@dnd-kit/sortable` for within-column reorder
- Status transitions must respect Jira workflow (not all transitions may be valid)
- Local status stored in ticket table; pushed status goes through Jira API
- Consider adding `localStatus` field to differentiate from Jira-synced status

## Out of Scope (for now)
- Drag to change assignee
- Drag to change sprint
- Sub-task reordering
- Custom status columns
