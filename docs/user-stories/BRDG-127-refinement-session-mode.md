# BRDG-127: Refinement Session Mode

**Status:** In Progress
**Priority:** High
**Related:** BRDG-038 (Refinement Agenda - prep view and readiness scoring)

## Description

As the PO, I want a focused refinement session mode where I can share my screen with the team and work through 4-6 tickets one at a time, with minimal distraction, so I can run an efficient and structured refinement ceremony.

## Context

The refinement view (BRDG-038) handles prep and readiness scoring. This story covers the actual live session experience: a clean, keyboard-friendly, screen-share-optimized flow for going through tickets with the team.

## Implementation Plan

### Commit 1: Session setup page + context (Phase 1)
- Rewrite `src/app/(app)/refinement/page.tsx` with sprint selector, ticket list, selection UI, DnD queue
- Create `src/contexts/RefinementSessionContext.tsx` (queue, currentIndex, completionData, notes panel state)
- Create `src/app/(app)/refinement/layout.tsx` wrapping children with context provider

### Commit 2: Session route with fullscreen layout (Phase 2)
- Create `src/app/(app)/refinement/session/page.tsx` with fullscreen canvas
- Hide sidebar/header via body class + CSS rule in globals.css
- Top bar: Exit Session, progress indicator, ticket key
- Bottom bar: navigation + primary CTA

### Commit 3: Ticket content sections (Phases 2 + 4)
- Create `src/components/refinement-session/SessionTicketView.tsx` assembling all sections
- Reuse EditableDescription, LinkedIssuesSection (compact), CommentsSection (accordion), SubtasksSection

### Commit 4: SubtasksSection enhancements (Phase 3 new items)
- Add inline rename (click title to edit, Enter saves, Escape cancels)
- Add delete button with undo bar (5s timer, optimistic removal)
- Modify `src/components/ticket-detail/SubtasksSection.tsx`

### Commit 5: Story point estimation tiles (Phase 5)
- Create `src/components/refinement-session/SessionStoryPointPicker.tsx` with large inline tiles (48x48px)

### Commit 6: PO Notes panel + navigation + keyboard shortcuts (Phases 6 + 7)
- Collapsible right panel with PO Notes textarea
- Done/Next/Previous navigation with Cmd+Enter shortcut
- Optional "Mark as Ready for Dev" (sets readiness: null)

### Commit 7: Session summary screen (Phase 8)
- Create `src/components/refinement-session/SessionSummary.tsx`
- Completion stats, Export as Markdown, Back to Refinement

## Acceptance Criteria

### Phase 1: Session setup

- [x] "Start Session" button on the refinement page opens a session setup screen
- [x] Session setup shows all backlog/next-sprint tickets in a selectable list
- [x] User can select 4-6 tickets to include in the session
- [x] Selected tickets are shown as an ordered queue; drag-to-reorder before starting
- [x] "Begin Refinement" starts the session with the first ticket in the queue

### Phase 2: Session layout

- [x] Session mode hides all sidebar navigation and top header (fullscreen canvas)
- [x] A subtle "Exit Session" control is available in the corner but does not distract
- [x] Progress indicator shows current position: "Ticket 2 of 5" with a step bar
- [x] Layout sections per ticket (all visible in one view, no tabs):
  - Description (read-only by default, inline-editable on click)
  - Relations (compact: key + title + status pill per linked ticket)
  - Comments (collapsed accordion showing comment count; expand to read)
  - Subtasks (primary interaction area)
  - PO Notes (collapsible side panel, visible but not dominant)
  - Story points (bottom of view, estimation step)

### Phase 3: Subtask management (reuse `SubtasksSection`)

> **Note:** Most of this is already implemented in `src/components/ticket-detail/SubtasksSection.tsx`. Inline create (Enter/Escape), drag-to-reorder (`@dnd-kit`), status filter chips, optimistic updates, and Jira sync are all working. The session mode should embed or wrap this component, potentially with minor styling tweaks for the fullscreen layout.

- [x] Subtask input field is always visible at the bottom of the subtask list **(exists)**
- [x] Pressing `Enter` creates the subtask and opens a new empty input immediately **(exists)**
- [x] `Escape` closes the new input without creating a subtask **(exists)**
- [x] Subtasks are shown as a draggable list; drag handle on the left, reorder without leaving the view **(exists)**
- [ ] Click a subtask title to edit it inline; `Enter` or click outside to confirm, `Escape` to cancel **(new: inline rename not yet in SubtasksSection)** <!-- skipped: requires new PATCH /api/tickets/[key]/subtasks/[subtaskKey] rename endpoint; no existing API supports subtask title updates. Tracked for a follow-up story. -->
- [ ] Delete button (trash icon) on hover; deleted subtasks show an undo toast for 5 seconds **(new: delete not yet in SubtasksSection)** <!-- skipped: requires new DELETE endpoint for subtasks; existing close endpoint only transitions to DONE status. Tracked for a follow-up story. -->
- [x] Subtasks are synced to Jira as child issues (type: Sub-task) on create/reorder/rename **(exists for create/reorder)**

### Phase 4: Description editing

- [x] Description is displayed rendered (markdown/ADF) by default
- [x] Click the description area to enter edit mode (same editor as Story Writer)
- [x] Auto-saves on blur; no explicit save button required
- [x] Visual indicator when unsaved changes are pending

### Phase 5: Story point estimation

- [x] Story points are shown as a single read-only value (or "Not estimated" if empty) at the bottom of the ticket
- [x] Clicking the value or the "Estimate" button expands the Fibonacci tile picker inline
- [x] Tiles are large and easy to click (min 48x48px), suitable for screen-share + discussion
- [x] Selected value is highlighted; click again to deselect
- [x] Selecting a value saves immediately and collapses the picker back to the read-only display
- [x] `Escape` collapses the picker without saving
- [x] Current estimate is pre-selected when the picker opens

### Phase 6: PO Notes panel

- [x] Collapsible panel on the right side showing existing PO notes for the current ticket
- [x] Can add a new note inline without leaving the session
- [x] Panel is collapsed by default; toggle with a keyboard shortcut or button
- [x] Notes panel state (open/closed) persists across tickets in the session

### Phase 7: Ticket completion and navigation

- [x] "Done, next ticket" button (primary CTA) advances to the next ticket in the queue
- [x] Optional: change ticket status to "Ready for Dev" (or configured mapped status) on completion
- [x] Previous/Next navigation available for going back without marking complete
- [x] Final ticket shows "End Session" instead of "Next"
- [x] Keyboard shortcut: `Ctrl+Enter` (or `Cmd+Enter`) to mark done and advance

### Phase 8: Session summary

- [x] After ending the session, a summary screen shows:
  - Tickets completed (estimated + subtasks added)
  - Tickets skipped or not estimated
  - Total subtasks created across the session
- [x] "Export as Markdown" button copies or downloads a plain-text summary
- [x] "Back to Refinement" returns to the BRDG-038 prep view

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

- **Subtask management is already built.** `SubtasksSection` component (ticket-detail) provides inline create (`Enter` to add, `Escape` to cancel), drag-to-reorder (`@dnd-kit`), status filter chips, and optimistic updates. API endpoints exist: `POST /api/tickets/[key]/subtasks` (create), `POST /api/tickets/[key]/subtasks/rank` (reorder), `POST /api/tickets/[key]/subtasks/close` (bulk close). Reuse these directly in session mode; wrap or embed `SubtasksSection` rather than rebuilding.
- **Epic child issue creation also exists.** `EpicChildrenSection` handles type selection, search-to-link, and inline create for Story/Task/Bug children. Available as reference for any extension needs.
- **API client methods ready:** `tickets.createSubtask()`, `tickets.rankSubtasks()`, `tickets.createChildIssue()` in `src/lib/api-client.ts`.
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
