# BRDG-164: Subtask Inline Rename and Delete

**Status:** Open
**Priority:** Medium
**Related:** BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want to rename and delete subtasks directly from the subtask list (both in ticket detail and refinement session mode), so I can quickly fix typos and remove irrelevant subtasks without leaving the view.

## Context

These two features were scoped in BRDG-127 (Phase 3) but skipped during implementation because the required API endpoints do not exist yet. The existing `SubtasksSection` component supports create and reorder but not rename or delete.

## Implementation Plan

### Phase 1: API layer (Commit 1)
1. Create `src/app/api/tickets/[key]/subtasks/[subtaskKey]/route.ts` with PATCH (rename) and DELETE handlers
2. Both handlers reuse `jiraClient.updateIssue()` -- rename sends `{ summary: title }`, delete sends `{ summary: "deleteme" }`
3. Add `renameSubtask` and `deleteSubtask` to `tickets` object in `src/lib/api-client.ts`
4. Write tests in `route.test.ts` following the existing pattern from `subtasks/route.test.ts`

### Phase 2: Inline rename UI (Commit 2)
5. Add `editingKey`/`editingTitle` state to `SubtasksSection`
6. Modify both `SortableSubtaskRow` and the non-sortable row to render an `<input>` when editing
7. Click title -> enter edit mode, Enter/blur -> save, Escape -> cancel
8. Optimistic title update with rollback on API error

### Phase 3: Delete with undo UI (Commit 3)
9. Add `pendingDelete` state with timer-based undo pattern
10. Add `Trash2` icon to both row variants (hover-visible)
11. Clicking delete hides the subtask, shows undo bar for 5 seconds
12. Undo restores; timeout flushes the DELETE API call
13. Flush any existing pending delete when starting a new one

## Acceptance Criteria

### Inline rename

- [ ] Click a subtask title to enter edit mode (inline input replaces the title text)
- [ ] `Enter` or click outside saves the new title
- [ ] `Escape` cancels without saving
- [ ] Optimistic UI: title updates immediately, reverts on error
- [x] New API endpoint: `PATCH /api/tickets/[key]/subtasks/[subtaskKey]` accepting `{ title: string }`
- [x] Endpoint calls `jiraClient.updateIssue(subtaskKey, { summary: title })` and updates `ticketSubtask` table
- [x] API client method: `tickets.renameSubtask(parentKey, subtaskKey, title)`

### Delete with undo

- [ ] Trash icon appears on hover for each subtask row
- [ ] Clicking delete optimistically removes the subtask from the list
- [ ] An undo bar appears at the bottom of the subtask section for 5 seconds
- [ ] If undo is clicked, the subtask is restored to its original position
- [ ] If undo is not clicked, the actual delete API call fires
- [x] New API endpoint: `DELETE /api/tickets/[key]/subtasks/[subtaskKey]`
- [x] Endpoint renames the subtask to `deleteme` in Jira via `jiraClient.updateIssue(subtaskKey, { summary: "deleteme" })` (a Jira automation rule picks this up and deletes the issue)
- [x] Endpoint removes the subtask from the local `ticketSubtask` table immediately
- [x] API client method: `tickets.deleteSubtask(parentKey, subtaskKey)`

## Technical Notes

- Modify `src/components/ticket-detail/SubtasksSection.tsx` (both `SortableSubtaskRow` and the non-sortable row)
- The undo bar should be local to the SubtasksSection (not a global toast), using a `useState`-based timer pattern
- **Delete strategy:** Jira does not allow issue deletion via REST API without admin permissions. Instead, the DELETE endpoint renames the subtask summary to `deleteme`. A Jira automation rule detects this and deletes the issue automatically. The UI and local database treat this as an immediate delete; the rename-to-deleteme mechanism is an implementation detail that should not be visible to the user.
- Both rename and delete reuse the existing `jiraClient.updateIssue()` method (`jira-client.ts:937`), so no new Jira client methods are needed

## Out of Scope

- Batch rename or batch delete
- Undo for rename (just cancel via Escape)
