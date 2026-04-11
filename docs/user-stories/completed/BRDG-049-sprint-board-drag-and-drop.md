# BRDG-049: Sprint Board Drag-and-Drop

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to drag tickets between status columns on the Sprint Board and have the change reflected locally so I can quickly reorganize during standups.

## Core Concepts

- **Drag handle**: Each ticket row has a grab handle for initiating drag
- **Drop zones**: Status column headers act as drop targets
- **Visual feedback**: Ghost preview while dragging, highlight target column
- **Local-first**: Status change saved to local DB immediately
- **Optional Jira push**: After drop, show a toast "Push to Jira?" with action button
- **Undo**: Toast with undo button appears after each drag-drop action
- **Constraints**: Only allow valid status transitions (configurable)

## Acceptance Criteria

### Phase 1: Drag infrastructure
- [ ] Add `@dnd-kit/core` and `@dnd-kit/sortable` DnD context provider wrapping the Sprint Board table
- [ ] Drag handle icon on each ticket row (visible on hover, always visible on touch)
- [ ] Drag handle uses a grab cursor and appropriate ARIA attributes
- [ ] Row becomes draggable only via the handle (not the entire row, to preserve cell clicks)
- [ ] Drag activation delay (150ms) to prevent accidental drags on click
- [ ] Touch support: drag starts after long press on mobile

### Phase 2: Drop zones
- [ ] Each status column header acts as a droppable target
- [ ] Visual highlight on the target column when a dragged row hovers over it (background color change)
- [ ] Drop zone expands slightly on hover to make targeting easier
- [ ] Invalid drop zones are visually dimmed or show a "not allowed" indicator
- [ ] Dropping outside any valid zone cancels the drag and returns the row to its original position

### Phase 3: Visual feedback
- [ ] Ghost preview of the dragged row follows the cursor with reduced opacity
- [ ] Original row position shows a placeholder (dashed border or faded row)
- [ ] Smooth drop animation when the row lands in its new status group
- [ ] Subtle scale animation on the ghost preview during pickup
- [ ] Overlay backdrop dims unrelated content during drag

### Phase 4: Status update
- [ ] On successful drop, update the ticket status in the local DB via existing API
- [ ] Status change updates `ticket_metadata.poStatus` or `ticket.status` depending on configuration
- [ ] SWR cache revalidation after status update to reflect changes across the UI
- [ ] Optimistic update: row moves to new group immediately, reverts on API failure
- [ ] Error toast if the local DB update fails, with the row reverting to its original position

### Phase 5: Undo toast and optional Jira push
- [ ] After each successful drag-drop, show a toast with "Status changed to [new status]"
- [ ] Toast includes an "Undo" button that reverts the status change within 8 seconds
- [ ] Toast includes a "Push to Jira" action button
- [ ] Clicking "Push to Jira" uses the existing push-to-jira infrastructure to sync the status
- [ ] Push-to-Jira button shows loading state while syncing and success/error feedback
- [ ] Undo after Jira push also reverts the Jira status (or warns that Jira was already updated)

### Phase 6: Transition constraints
- [ ] Status transition rules stored in `appSetting` as a JSON configuration
- [ ] Default rules: allow all transitions (no restrictions until configured)
- [ ] Invalid transitions show a brief "not allowed" animation and tooltip explaining why
- [ ] Settings page section to configure allowed transitions per status
- [ ] Transition rules are fetched once on Sprint Board load and cached
- [ ] Visual cue on drop zones indicating whether a transition is valid for the currently dragged ticket

## Technical Notes

- `@dnd-kit` is already in dependencies (used for quick prompts drag-and-drop)
- Sprint Board uses a table layout, so drag needs to work with table rows rather than card-based layouts
- Status change updates `ticket_metadata.poStatus` or `ticket.status` depending on config
- If pushing to Jira, uses existing push-to-jira infrastructure
- Status transition rules can be stored in `appSetting` table as a JSON value
- Need to handle edge cases: drag cancelled, dropped outside valid zone, concurrent edits
- Consider performance: avoid re-rendering the entire table during drag by isolating drag state

## Out of Scope (for now)

- Drag to reorder within a column
- Drag to change assignee
- Multi-select drag (dragging multiple tickets at once)
- Jira auto-push (always manual confirmation)
- Kanban board view (this is table-row-based drag only)
