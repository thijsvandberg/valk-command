# BRDG-051: Inline Ticket Editing on Sprint Board

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to double-click cells on the Sprint Board to edit story points, PO status, or notes inline so I can make quick updates without opening the side panel.

## Acceptance Criteria

### Phase 1: Inline edit infrastructure
- [ ] Double-click on editable cells activates edit mode
- [ ] Editable fields: story points, PO status, PO notes, quality score override
- [ ] Non-editable fields: ticket key, Jira status, assignee (Jira-owned fields)
- [ ] Visual indicator on hover showing which cells are editable (subtle pencil icon or border)

### Phase 2: Edit controls
- [ ] Story points: number input with increment/decrement buttons
- [ ] PO status: dropdown selector with existing status options
- [ ] PO notes: small text input (single line) or expandable textarea
- [ ] Enter to confirm, Escape to cancel
- [ ] Click outside to confirm

### Phase 3: Save and feedback
- [ ] Optimistic update on confirm (instant visual change)
- [ ] API call to save the change (PATCH to metadata endpoint)
- [ ] Error state: revert to previous value and show inline error message
- [ ] Success: subtle flash animation on the edited cell

### Phase 4: Keyboard navigation
- [ ] Tab between editable cells in the same row
- [ ] Shift+Tab to go backwards
- [ ] Arrow keys to move between rows while in edit mode

## Technical Notes

- Reuse existing metadata PATCH API (`/api/tickets/[key]/metadata`)
- Story points edit requires Jira push (optional, prompt user)
- Track which fields are PO-local vs Jira-synced to determine editability
- Debounce notes input (save after 500ms of no typing)

## Out of Scope (for now)
- Bulk inline editing (edit same field across multiple rows)
- Inline editing of Jira fields (requires Jira write, see BRDG-012)
- Undo history for inline edits
- Inline editing in Kanban view
