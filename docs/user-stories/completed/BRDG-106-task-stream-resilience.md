# BRDG-106: Task Stream Resilience

**Status:** Completed
**Priority:** High

## Description

When a workspace task is running (e.g. an investigation or review) and the user navigates away from the conversation or refreshes the page, the SSE stream connection is lost. The task continues running on the VRW but Bridge loses track of it. The result is never saved as an assistant message, and the user sees no progress or output.

This is a problem for long-running skills like `investigate` (which can take 30-60 seconds) where the user might switch tabs, navigate to another conversation, or refresh while waiting.

### Current behavior

1. User submits a skill invocation (e.g. investigation)
2. Bridge opens an SSE stream to `/api/workspace-tasks/[id]/stream`
3. User navigates away or refreshes
4. SSE connection drops, `useWorkspaceTask` resets to `idle`
5. Task completes on VRW but Bridge never receives the result
6. User returns to the conversation and sees nothing

### Desired behavior

1. Task results are always captured, even if the user navigates away
2. Running tasks are visible (the user can see that something is in progress)
3. If the user returns to a conversation with a completed task, the result is shown

## Implementation Plan

### Architecture

The core change decouples the upstream VRW stream from the browser connection. When a task is submitted, the server spawns a background SSE consumer (via `after()` from `next/server`) that persists independently of the browser. The browser stream proxy remains a secondary consumer for real-time progress only.

### Step 1: DB Migration + schema.ts
Add `output` (text, nullable) and `error` (text, nullable) to `workspace_task` table.
- Create `drizzle/0037_workspace_task_output.sql`
- Update `src/db/schema.ts`

### Step 2: Server-side background stream handler
Create `src/lib/task-stream-handler.ts` (server-only):
- Inserts a `workspace_task` row with `status: "running"`
- Opens SSE stream to VRW independently
- Parses SSE events, accumulates output
- On `result`: updates workspace_task (`completed`, stores output), saves assistant message, creates notification
- On error/timeout: marks task `failed`, saves error message

### Step 3: Modify POST /api/workspace-tasks
- Ensure conversation exists in Bridge DB (create if needed)
- Call `after(() => captureTaskStream(...))` to run background handler
- Return `conversationId` in response

### Step 4: Decouple stream proxy from browser lifecycle
- In `/api/workspace-tasks/[id]/stream/route.ts`, remove the `request.signal` abort propagation to upstream
- Browser disconnect closes the proxy, not the upstream

### Step 5: GET /api/workspace-tasks with local DB filter
- Accept `?conversationId=X&status=running` query params
- Query Bridge's local `workspace_task` table when params provided
- Fallback to VRW proxy when no params

### Step 6: useWorkspaceTask reconnection on mount
- Accept optional `conversationId` parameter
- On mount, if `conversationId` provided and status is idle, check for running tasks
- If running: reconnect to stream
- If completed: show output (already saved by background handler)

### Step 7: ChatLayout updates
- Pass `activeId` to `useWorkspaceTask(activeId)`
- Remove client-side message save (now done server-side)
- Keep review-persistence logic for when browser is connected

### Step 8: ConversationList running indicator
- Accept `runningTaskConversationIds: Set<string>` prop
- Render pulsing dot for conversations with active tasks

### Step 9: Header "Task running..." indicator
- In conversation header, show indicator when task is streaming

### Step 10: Background task completion toast
- TaskCompletionNotifier component polls for `category: "agent"` alerts
- Mount in app layout alongside ActivityToast

### Implementation Order
Phase 1 (Steps 1-4), then Phase 2 (Steps 5-7), then Phase 3 (Steps 8-10). Each phase depends on the previous.

## Acceptance Criteria

### Phase 1: Server-side result capture

- [x] When a task is submitted via `POST /api/workspace-tasks`, Bridge opens a server-side SSE connection to the VRW that persists independently of the browser connection
- [x] When the task completes, the server-side handler saves the output as an assistant message in the conversation (regardless of whether the browser is still connected)
- [x] The `workspace_task` table is updated with `status: "completed"` and the output is stored
- [x] If the server-side stream fails or times out, the task is marked as `failed` with an error message saved to the conversation

### Phase 2: Reconnection on navigation

- [x] When the user navigates to a conversation that has a running task, the UI reconnects to the stream and shows progress
- [x] `useWorkspaceTask` checks for active tasks on the current conversation when mounting (e.g. `GET /api/workspace-tasks?conversationId=X&status=running`)
- [x] If a running task is found, the hook reconnects to its stream automatically
- [x] If a completed task is found that hasn't been saved as a message yet, the result is fetched and displayed

### Phase 3: Task status visibility

- [x] Show a small indicator in the conversation list when a conversation has a running task (e.g. a pulsing dot or spinner next to the conversation title)
- [x] In the conversation header, show "Task running..." when there's an active task for the current conversation
- [x] Show a toast/notification when a background task completes ("Investigation complete" with a link to the conversation)

## Technical Notes

### Server-side stream capture

The key change is moving the SSE stream consumption from browser-only to server-side. Options:

1. **Background stream handler**: When `POST /api/workspace-tasks` creates a task, it also spawns a server-side process that connects to the VRW stream and waits for completion. On completion, it saves the result as an assistant message. The browser stream is a secondary consumer for real-time progress only.

2. **Polling fallback**: If the browser SSE connection drops, a periodic poll (`GET /api/workspace-tasks/[id]`) checks for completion and saves the result. Simpler but less real-time.

3. **VRW callback**: The VRW calls back to Bridge when a task completes (webhook-style). Requires a new endpoint on Bridge and changes to VRW.

Recommendation: Option 1 (server-side stream) is most robust. The browser stream provides real-time progress, the server-side stream ensures results are always captured.

### Task state persistence

The existing `workspace_task` table already has `status`, `startedAt`, `completedAt`. Add:
- `output` (text, nullable): store the task result so it can be retrieved later
- `error` (text, nullable): store error details for failed tasks
- `conversationId` already exists and is indexed

### Reconnection flow

```
User navigates to conversation
  -> useWorkspaceTask checks for running tasks (API call)
  -> If running: reconnect to stream, show TaskProgress
  -> If completed but no assistant message: save result, show in chat
  -> If idle: normal state
```

## Related

- BRDG-104: Code Investigation Skill (surfaced this issue due to long-running tasks)
- Existing `workspace_task` table in `src/db/schema.ts`
- `useWorkspaceTask` hook in `src/hooks/useWorkspaceTask.ts`
- Stream proxy in `src/app/api/workspace-tasks/[id]/stream/route.ts`
