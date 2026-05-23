# BRDG-170: Refinement Session View Polish

**Status:** Done
**Priority:** High
**Related:** BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want the refinement session view to feel like a full-featured working environment for each ticket, so I can do everything I need during the ceremony without leaving the session.

## Implementation Plan

1. **Bottom bar cleanup** (`session/page.tsx`): Remove `markReady` state and checkbox. In `handleDoneAndNext`, auto-set readiness to null when `ticketData?.storyPoints != null`.
2. **Ticket header redesign** (`SessionTicketView.tsx`): Replace plain text header with `TicketStatusPill`. Add Jira/Bridge icon buttons, story points badge (move from bottom), and Story Writer button.
3. **Editable title** (`SessionTicketView.tsx`): Replace static `<h1>` with `EditableTitle` component.
4. **Navigation dropdown** (`session/page.tsx` + `RefinementSessionContext.tsx`): Extend context with `queueMeta: { key, title }[]`. Add dropdown button next to progress dots listing all tickets with key, title, checkmark for visited.
5. **Subtasks side pane** (`session/page.tsx` + `SessionTicketView.tsx`): Add `subtasksPaneOpen` toggle. Render subtasks in a right-side panel (tabbed with PO Notes). Hide subtasks from main content when in pane mode.
6. **LinkedIssuesSection swap** (`SessionTicketView.tsx`): Replace `CompactRelations` with full `LinkedIssuesSection` for add/remove capabilities.
7. **Confluence + metadata panel + sprint picker** (`SessionTicketView.tsx`): Add `ConfluencePagesSection`, expandable metadata panel (creator/assignee/labels/epic/sprint/components/dates), inline sprint picker with `jira.moveSprint()`.

## Acceptance Criteria

### Bottom bar cleanup

- [x] Remove the "Mark as Ready for Dev" checkbox from the bottom bar
- [x] If a ticket has story points set, automatically set readiness to null (Ready for Dev) when clicking "Done, next ticket"

### Ticket header (top area of ticket view)

- [x] Replace the plain text key + status with the standard ticket pill component (same as sprint board, e.g. `[icon] VPL-24856 . DONE .`)
- [x] Pill links to Jira (external) and to Bridge ticket single view (internal) via two small icon buttons
- [x] Story points displayed in the header bar (move from bottom of view)
- [x] Button to open Story Writer for this ticket in a new tab
- [x] Title is editable inline (click to edit, Enter to save, Escape to cancel)

### Navigation dropdown

- [x] Button next to the progress indicator (top bar) opens a dropdown listing all tickets in the queue
- [x] Each item shows key, title, and a checkmark if already visited/completed
- [x] Clicking a ticket in the dropdown jumps to it

### Subtasks side pane

- [x] Button to toggle subtasks into a side pane (right side, alongside or replacing PO Notes)
- [x] When in side pane mode, subtasks are always visible while scrolling the main content

### Related stories

- [x] "Related stories" section with the same edit capabilities as the ticket single view (LinkedIssuesSection)
- [x] Can add/remove issue links without leaving the session

### Issue links and metadata

- [x] Show Confluence page links (if any) for the current ticket
- [x] Button to expand a metadata panel showing: creator, assignee, labels, epic, sprint, components, created/updated dates
- [x] Sprint field is editable: quick-move to another sprint via sprint picker

### Sprint assignment

- [x] Inline sprint picker in the metadata panel
- [x] Moving a ticket to a different sprint saves immediately to Jira

## Technical Notes

- Ticket pill: reuse the existing `TicketPill` or `StatusBadge` + key pattern from sprint board
- Story points in header: move `SessionStoryPointPicker` to the header area, collapsed by default
- Title editing: reuse the `EditableTitle` pattern from ticket detail page
- Subtask side pane: toggle state in `RefinementSessionContext` (like `notesCollapsed`)
- Metadata panel: extract relevant fields from `TicketSidebar` into a lightweight read/edit panel
- Sprint picker: reuse `SprintListModal` from sprint board
- Navigation dropdown: read from `RefinementSessionContext.queue` and `completionData`

## Out of Scope

- Drag-to-reorder tickets within the session from the dropdown
- Changing ticket Jira status from within the session (beyond readiness)
