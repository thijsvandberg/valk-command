# BRDG-164: Subtask Inline Rename and Delete

**Status:** Open
**Priority:** Medium
**Related:** BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want to rename and delete subtasks directly from the subtask list (both in ticket detail and refinement session mode), so I can quickly fix typos and remove irrelevant subtasks without leaving the view.

## Context

These two features were scoped in BRDG-127 (Phase 3) but skipped during implementation because the required API endpoints do not exist yet. The existing `SubtasksSection` component supports create and reorder but not rename or delete.

## Acceptance Criteria

### Inline rename

- [ ] Click a subtask title to enter edit mode (inline input replaces the title text)
- [ ] `Enter` or click outside saves the new title
- [ ] `Escape` cancels without saving
- [ ] Optimistic UI: title updates immediately, reverts on error
- [ ] New API endpoint: `PATCH /api/tickets/[key]/subtasks/[subtaskKey]` accepting `{ title: string }`
- [ ] Endpoint calls `jiraClient.updateIssue(subtaskKey, { summary: title })` and updates `ticketSubtask` table
- [ ] API client method: `tickets.renameSubtask(parentKey, subtaskKey, title)`

### Delete with undo

- [ ] Trash icon appears on hover for each subtask row
- [ ] Clicking delete optimistically removes the subtask from the list
- [ ] An undo bar appears at the bottom of the subtask section for 5 seconds
- [ ] If undo is clicked, the subtask is restored to its original position
- [ ] If undo is not clicked, the actual delete API call fires
- [ ] New API endpoint: `DELETE /api/tickets/[key]/subtasks/[subtaskKey]`
- [ ] Endpoint transitions the subtask to DONE in Jira (or deletes if permissions allow)
- [ ] API client method: `tickets.deleteSubtask(parentKey, subtaskKey)`

## Technical Notes

- Modify `src/components/ticket-detail/SubtasksSection.tsx` (both `SortableSubtaskRow` and the non-sortable row)
- The undo bar should be local to the SubtasksSection (not a global toast), using a `useState`-based timer pattern
- Jira does not support true issue deletion via REST API without admin permissions; prefer transitioning to DONE status as the "delete" action, with a clear label like "Close subtask"

## Out of Scope

- Batch rename or batch delete
- Undo for rename (just cancel via Escape)
