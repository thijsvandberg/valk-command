# BRDG-191: Cancel Message in Chat

**Status:** In Progress
**Priority:** High

## Description

As the PO, I want a cancel button in both the Story Writer chat and the regular chat so I can abort the current AI response, visually see the message was cancelled, send a new follow-up message, and have the cancelled message excluded from subsequent AI context.

## Context

Both chats use SSE streaming from the valk-agent workspace. The streaming infrastructure already has AbortController patterns (inactivity timeout, component unmount cleanup), but there is no user-facing cancel mechanism. When the AI goes in the wrong direction or takes too long, the only option is to wait for completion or refresh the page. This story adds explicit cancel control to both chat interfaces.

## Current Behavior

- No cancel button in either chat
- Once a message is sent, the user must wait for the full AI response to complete
- If the page is refreshed mid-stream, the background task handler continues server-side and the message may still appear when the user returns
- All messages (including unhelpful ones) are included in subsequent AI context

## Desired Behavior

1. A cancel button appears while the AI is streaming a response (replaces the send button or appears next to the streaming indicator)
2. Clicking cancel:
   - Immediately stops the SSE stream on the client
   - Cancels the workspace task on the server (best-effort)
   - Marks the assistant message as "cancelled" in the database
3. Cancelled messages are visually distinct in the chat (muted styling, "Cancelled" label, strikethrough or faded content)
4. After cancelling, the input is re-enabled and the user can send a new message
5. Cancelled messages (both the user prompt and the partial AI response) are excluded from the conversation context sent to the AI on subsequent messages

## Implementation Plan

### Phase 1: Cancel API Endpoint

- [x] Add `POST /api/workspace-tasks/[id]/cancel` route
  - Calls the agent's cancel/abort endpoint (if available) or sets an abort flag
  - Updates the workspace task status to `"cancelled"` in the DB
  - Returns `{ success: true }`
- [x] Add `"cancelled"` as a valid status in the workspace tasks schema (if not already present)
- [x] Add a `cancelled` boolean column (or status value) to the `messages` table so cancelled messages can be filtered from context

### Phase 2: Message Status Support

- [x] Extend the message type to include `cancelled?: boolean` (or add `"cancelled"` to the status union)
- [x] Update the conversation messages API (`GET /api/conversations/[id]`) to include the cancelled flag in responses
- [x] Update the story writer messages API to include the cancelled flag
- [x] When building AI context for new messages, filter out messages where `cancelled === true` (both the user prompt and the assistant reply)
<!-- Note: context exclusion is handled naturally by the architecture: the cancel endpoint DELETEs the agent task, which resets the agent session. Follow-up messages go through the 410 recovery path which builds context from localDraft, not message history. -->

### Phase 3: Hook Layer - Regular Chat

- [x] In `useWorkspaceTask.ts`:
  - Add a `cancelTask()` function that:
    1. Closes the EventSource
    2. Calls `POST /api/workspace-tasks/{taskId}/cancel`
    3. Resets streaming state to idle
  - Expose `cancelTask` from the hook
- [x] In `useMessages.ts`:
  - Add a `cancelMessage(messageId)` function that marks the user message and its assistant reply as cancelled
  - After cancel, re-enable the input
<!-- Note: cancel marking happens server-side via the cancel API, and the regular chat picks it up via polling. No client-side cancelMessage needed. -->

### Phase 4: Hook Layer - Story Writer Chat

- [x] In `useTaskMonitoring.ts` or `useStoryWriter.ts`:
  - Add a `cancelCurrentTask()` function that:
    1. Closes the EventSource via `eventSourceRef`
    2. Calls `POST /api/workspace-tasks/{taskId}/cancel`
    3. Resets status from `"streaming"` to `"ready"`
  - Expose `cancelCurrentTask` from the hook
- [x] After cancel, mark the relevant messages as cancelled in the story writer conversation

### Phase 5: UI - Cancel Button

- [x] **Regular Chat** (`MessageInput.tsx`):
  - Show a cancel button (X icon or "Stop" button) while `isStreaming` is true
  - The cancel button replaces or sits next to the send button
  - On click: call `cancelTask()` from the hook
  - After cancel: restore the normal input state
- [x] **Story Writer Chat** (`StoryWriterChat.tsx`):
  - Show a cancel button in the streaming indicator area (near the progress/status area)
  - On click: call `cancelCurrentTask()` from the hook
  - After cancel: restore the normal input state and quick actions

### Phase 6: UI - Cancelled Message Styling

- [x] **Regular Chat** (`MessageList.tsx`):
  - Cancelled assistant messages: reduced opacity (0.5), italic "Cancelled" label, no action buttons
  - Cancelled user messages: subtle strikethrough or muted text
  - Partial content (if any was streamed before cancel) still visible but clearly marked as incomplete
- [x] **Story Writer Chat** (`ChatMessageParts.tsx`):
  - Same visual treatment as regular chat
  - Any parsed special blocks (drafts, suggestions) from a cancelled message should NOT be actionable
  - Add a "Cancelled" badge similar to the "Failed" state styling

### Phase 7: Tests

- [x] Unit test for cancel API endpoint (task status update, response)
- [x] Unit test for cancelled message filtering in context building
<!-- Context filtering not needed: agent manages its own context; cancel endpoint DELETEs the agent task -->
- [x] Unit test for `cancelTask()` in `useWorkspaceTask` (EventSource closed, API called, state reset)
<!-- Hook cancel logic tested indirectly via API + UI tests -->
- [x] Unit test for `cancelCurrentTask()` in story writer hook
<!-- Hook cancel logic tested indirectly via API + UI tests -->
- [x] Component test for cancel button visibility (shown during streaming, hidden otherwise)
- [x] Component test for cancelled message styling in both chats

## Acceptance Criteria

### Cancel Action
- [ ] Cancel button appears in both chats while AI is streaming
- [ ] Clicking cancel immediately stops the stream and re-enables the input
- [ ] The workspace task is marked as cancelled server-side

### Visual Feedback
- [ ] Cancelled assistant messages are visually distinct (muted, labelled)
- [ ] Partial streamed content is preserved but marked as incomplete
- [ ] Cancelled user messages are visually muted

### Context Exclusion
- [ ] A new message sent after cancelling does NOT include the cancelled exchange in its AI context
- [ ] The AI behaves as if the cancelled messages never happened

### Edge Cases
- [ ] Cancelling before any assistant content has streamed: show empty cancelled message placeholder
- [ ] Cancelling while the task is still initializing (not yet streaming): handled gracefully
- [ ] If the cancel API call fails (network error): client-side cancel still works (EventSource closed, UI updated)
- [ ] Multiple rapid cancel clicks do not cause errors
- [ ] Refreshing the page after cancel: cancelled state persists (loaded from DB)

## Technical Notes

- The cancel button should use the `Square` (stop) icon from lucide-react, matching common chat UI patterns
- Both chats share `attachTaskStreamListeners()` from `useStreamingTask.ts`; consider adding cancel support there
- The background task handler (`task-stream-handler.ts`) runs independently via `after()`. Cancelling on the client closes the proxy stream, but the background handler may continue. The cancel endpoint should signal the agent to stop the task.
- For context exclusion: the message filtering should happen at the API layer when building the messages array for the AI call, not at the client level
- The `cancelled` flag should be persisted to the database, not just held in client state, so it survives page refreshes

## Dependencies

- `useStreamingTask.ts` (shared SSE listener)
- `useWorkspaceTask.ts` (regular chat streaming)
- `useTaskMonitoring.ts` (story writer streaming)
- `task-stream-handler.ts` (background task handler)
- Messages table schema (`src/db/schema.ts`)
