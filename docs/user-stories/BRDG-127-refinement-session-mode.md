# BRDG-127: Refinement Session Mode

**Status:** Open
**Priority:** High
**Related:** BRDG-038 (Refinement Agenda - prep view and readiness scoring)

## Description

As the PO, I want a focused refinement session mode where I can share my screen with the team and work through 4-6 tickets one at a time, with minimal distraction, so I can run an efficient and structured refinement ceremony.

## Context

The refinement view (BRDG-038) handles prep and readiness scoring. This story covers the actual live session experience: a clean, keyboard-friendly, screen-share-optimized flow for going through tickets with the team.

## Acceptance Criteria

### Phase 1: Session setup

- [ ] "Start Session" button on the refinement page opens a session setup screen
- [ ] Session setup shows all backlog/next-sprint tickets in a selectable list
- [ ] User can select 4-6 tickets to include in the session
- [ ] Selected tickets are shown as an ordered queue; drag-to-reorder before starting
- [ ] "Begin Refinement" starts the session with the first ticket in the queue

### Phase 2: Session layout

- [ ] Session mode hides all sidebar navigation and top header (fullscreen canvas)
- [ ] A subtle "Exit Session" control is available in the corner but does not distract
- [ ] Progress indicator shows current position: "Ticket 2 of 5" with a step bar
- [ ] Layout sections per ticket (all visible in one view, no tabs):
  - Description (read-only by default, inline-editable on click)
  - Relations (compact: key + title + status pill per linked ticket)
  - Comments (collapsed accordion showing comment count; expand to read)
  - Subtasks (primary interaction area)
  - PO Notes (collapsible side panel, visible but not dominant)
  - Story points (bottom of view, estimation step)

### Phase 3: Subtask management

- [ ] Subtask input field is always visible at the bottom of the subtask list
- [ ] Pressing `Enter` creates the subtask and opens a new empty input immediately
- [ ] `Escape` closes the new input without creating a subtask
- [ ] Subtasks are shown as a draggable list; drag handle on the left, reorder without leaving the view
- [ ] Click a subtask title to edit it inline; `Enter` or click outside to confirm, `Escape` to cancel
- [ ] Delete button (trash icon) on hover; deleted subtasks show an undo toast for 5 seconds
- [ ] Subtasks are synced to Jira as child issues (type: Sub-task) on create/reorder/rename

### Phase 4: Description editing

- [ ] Description is displayed rendered (markdown/ADF) by default
- [ ] Click the description area to enter edit mode (same editor as Story Writer)
- [ ] Auto-saves on blur; no explicit save button required
- [ ] Visual indicator when unsaved changes are pending

### Phase 5: Story point estimation

- [ ] Story points are shown as a single read-only value (or "Not estimated" if empty) at the bottom of the ticket
- [ ] Clicking the value or the "Estimate" button expands the Fibonacci tile picker inline
- [ ] Tiles are large and easy to click (min 48x48px), suitable for screen-share + discussion
- [ ] Selected value is highlighted; click again to deselect
- [ ] Selecting a value saves immediately and collapses the picker back to the read-only display
- [ ] `Escape` collapses the picker without saving
- [ ] Current estimate is pre-selected when the picker opens

### Phase 6: PO Notes panel

- [ ] Collapsible panel on the right side showing existing PO notes for the current ticket
- [ ] Can add a new note inline without leaving the session
- [ ] Panel is collapsed by default; toggle with a keyboard shortcut or button
- [ ] Notes panel state (open/closed) persists across tickets in the session

### Phase 7: Ticket completion and navigation

- [ ] "Done, next ticket" button (primary CTA) advances to the next ticket in the queue
- [ ] Optional: change ticket status to "Ready for Dev" (or configured mapped status) on completion
- [ ] Previous/Next navigation available for going back without marking complete
- [ ] Final ticket shows "End Session" instead of "Next"
- [ ] Keyboard shortcut: `Ctrl+Enter` (or `Cmd+Enter`) to mark done and advance

### Phase 8: Session summary

- [ ] After ending the session, a summary screen shows:
  - Tickets completed (estimated + subtasks added)
  - Tickets skipped or not estimated
  - Total subtasks created across the session
- [ ] "Export as Markdown" button copies or downloads a plain-text summary
- [ ] "Back to Refinement" returns to the BRDG-038 prep view

## Keyboard Shortcuts (session mode)

| Action | Shortcut |
|--------|----------|
| Create subtask | `Enter` (in subtask input) |
| Navigate subtasks | `Tab` / `Shift+Tab` |
| Edit subtask title | `Enter` on selected subtask |
| Confirm edit | `Enter` |
| Cancel edit/input | `Escape` |
| Toggle PO notes panel | `P` |
| Next ticket (mark done) | `Cmd+Enter` |
| Previous ticket | `Cmd+ArrowLeft` |

## Technical Notes

- Subtask sync: POST to `/api/tickets/[key]/subtasks`, PATCH for rename, DELETE for remove; reorder via a dedicated order endpoint
- Story points: PATCH to `/api/tickets/[key]/metadata` for local, plus Jira write via existing story points API
- Description autosave: debounce 1s, same mechanism as Story Writer
- Session state (queue, current index, completion flags) lives in local component state only; no persistence needed
- Fullscreen layout: use a dedicated route segment or portal that bypasses the app shell layout
- Relations data: already available from the ticket detail API; render as compact pills

## Out of Scope

- Multi-user session sync (other team members seeing the same view)
- Planning poker / voting integration
- Video/audio integration
- Saving session history
- Jira sprint transitions triggered from session
