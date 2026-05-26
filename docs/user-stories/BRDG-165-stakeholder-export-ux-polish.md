# BRDG-165: Stakeholder Export UX Polish

**Status:** Draft
**Priority:** High
**Depends on:** BRDG-156

## Description

Follow-up to BRDG-156. The stakeholder export works end-to-end (workspace skill runs, result appears in chat), but the UX needs significant polish:

1. The chat message is empty/context-free (just "/export stakeholder summary")
2. The user gets navigated away from the sprint board to the chat view
3. No progress indication while the workspace processes
4. No easy way to copy the result or go back

## Current Behavior

- User clicks Export in the BulkActionBar
- A workspace task is created and the user is immediately navigated to `/chat/{conversationId}`
- The chat shows a user message "/export stakeholder summary" with no ticket context
- No spinner or progress indicator while waiting for the workspace result
- After the result arrives, the user must manually copy text from the chat

## Desired Behavior

### 1. Better chat message content

The user message saved to the conversation should include useful context, not just the skill name. It should show:

- A clear label like "Stakeholder export for {sprintName}"
- The list of selected tickets (key + original title)
- Total points

This gives the chat conversation useful context even when revisited later.

### 2. Stay on the sprint board

Do NOT navigate to the chat view. The user should stay on the sprint board while the workspace processes. The flow should be:

1. User clicks Export
2. Button shows spinner ("Exporting...")
3. The workspace task runs in the background
4. When complete, show a **persistent toast/banner** (does not auto-dismiss) with:
   - "Export ready" message
   - "Copy to clipboard" button (copies the AI-rewritten text)
   - "View in chat" link (navigates to the conversation)
5. User can continue working on the sprint board while waiting

### 3. Progress tracking

- The Export button shows a spinner while the task is running
- Poll the workspace task status (`GET /api/workspace-tasks/{id}`) or use the stream endpoint to detect completion
- On error, show a toast with the error message and stop the spinner

### 4. Copy-to-clipboard from the result

When the workspace returns the rewritten summary:
- Auto-copy to clipboard (or provide a one-click copy button in the toast)
- The persistent toast stays visible until the user dismisses it

## Implementation Plan

1. **Server-side: Improve chat message content** (AC #1)
   - Add `export-stakeholder-summary` case to `buildConversationTitle()` and `buildPromptSummary()` in `src/app/api/workspace-tasks/route.ts`
   - Title: "Stakeholder Export: {sprintName}"
   - Prompt summary: list of selected tickets with keys + titles + total points

2. **Create `useExportTask` hook** (AC #2-8)
   - New file: `src/hooks/useExportTask.ts`
   - State machine: idle -> submitting -> polling -> completed/failed
   - `startExport()`: calls `workspaceTasks.create()`, then polls `GET /api/workspace-tasks?conversationId=X` every 3s
   - Returns `{ status, output, error, conversationId, startExport, dismiss }`

3. **Rewire `handleExportForStakeholders` in SprintBoard.tsx** (AC #2, #3)
   - Remove `router.push()` navigation after export starts
   - Derive `isExporting` from hook status (`submitting` or `polling`)
   - Spinner on Export button stays active until task completes/fails

4. **Add persistent export result toast** (AC #4, #5, #6, #7)
   - Separate `exportToastData` state in SprintBoard for completed exports
   - Success toast: "Export ready" + Copy to clipboard button + View in chat link + dismiss
   - Error toast: warning icon + error message + dismiss
   - No auto-dismiss (persistent until user acts)

5. **Handle duplicate notification** (edge case)
   - Use `"stakeholder-export-ready"` notification type in `task-stream-handler.ts` for this skill so `TaskCompletionNotifier` can distinguish it from generic task completions

## Acceptance Criteria

- [x] User message in chat includes sprint name + ticket list, not just "/export stakeholder summary"
- [ ] User stays on the sprint board after clicking Export (no navigation to chat)
- [ ] Spinner shown on Export button while workspace task is running
- [ ] Persistent toast appears when result is ready (not auto-dismissing)
- [ ] Toast has "Copy to clipboard" button that copies the AI result
- [ ] Toast has "View in chat" link to the conversation
- [ ] Error toast shown if workspace task fails
- [ ] Works when workspace is slow (30s+ response time)

## Technical Notes

- **Polling vs streaming:** Simplest approach is to poll `GET /api/workspace-tasks/{id}` every 2-3 seconds until status is "completed" or "error". Alternative: use the SSE stream endpoint.
- **Persistent toast:** The current toast auto-dismisses after 3 seconds. Either add a `persistent` variant or create a separate result banner component.
- **Result extraction:** The workspace task output is stored in the `workspace_task` table (`output` column). Poll that to get the final text.
- **Chat message improvement:** Modify the args or add a `userMessage` field to the workspace task creation payload to control what gets saved as the user message.

## Out of Scope

- Editing the rewritten titles before copying
- Customizable export format
- Saving exports to a history/log
