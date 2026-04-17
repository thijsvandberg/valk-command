# BRDG-072: Undo/Redo for Destructive Actions

**Status:** Open
**Priority:** Low

## Description

As the PO, I want undo support with a toast-based "Undo" button for destructive actions so accidental changes are easily reversible.

## Acceptance Criteria

### Phase 1: Undo toast pattern
- [ ] Generic undo toast component: shows action description + "Undo" button + auto-dismiss timer (8 seconds)
- [ ] Progress bar in toast showing time remaining to undo
- [ ] Click "Undo" reverts the action and dismisses the toast
- [ ] Toast auto-dismisses after timer; action becomes permanent

### Phase 2: Supported undo actions
- [ ] Delete PO comment: soft-delete, restore on undo
- [ ] Change PO status: revert to previous value on undo
- [ ] Discard story writer draft: restore draft on undo
- [ ] Remove bookmark (when BRDG-029 is done): restore on undo
- [ ] Dismiss alert: restore on undo

### Phase 3: Implementation pattern
- [ ] Actions that support undo delay the actual deletion (soft-delete or queue)
- [ ] Undo triggers a restore API call
- [ ] If toast expires without undo, finalize the action (hard-delete if applicable)
- [ ] Only one undo toast active at a time (new action replaces previous)

## Technical Notes

- Undo pattern: on "delete", mark as deleted (soft-delete) and show toast. After 8s, hard-delete. On undo, unmark.
- For status changes: store previous value in the toast state, PATCH back on undo
- Toast component can use a portal to render at a fixed position (bottom-center)
- Keep undo state client-side only (no server-side undo stack)

## Out of Scope (for now)
- Multi-step undo (Ctrl+Z history)
- Redo functionality
- Undo for Jira-synced changes
- Undo for story editor changes (editor has its own undo)
