# BRDG-084: Story Writer Message Reliability

**Status:** Open
**Priority:** High

## Description

As the PO, I need story writer messages to reliably reach the workspace and results to be reliably applied, so that I do not end up with orphaned messages, duplicate sends, or a chat that hangs on "Resuming..." after a page reload.

Currently, when sending a message fails after it has already been saved to the database, the message sits in the chat without a `workspaceTaskId`, is never retried, and clutters the conversation. The resume-on-reload flow has a React Strict Mode bug that prevents completed tasks from being applied (fixed ad-hoc, but the underlying monitoring flow is still fragile). Rapid double-clicks can create duplicate workspace tasks.

## Background

This was discovered when VPL-44652's story writer showed 4 identical user messages and hung on "Resuming..." indefinitely. Investigation revealed:

1. **Orphaned messages:** The first 3 messages were saved to DB but the agent send failed (no `workspaceTaskId`). They are visible in chat but can never trigger a resume or be retried.
2. **Resume flow bug:** The 4th message did reach the agent and completed, but on page reload the `useTaskMonitoring` polling/SSE flow never applied the result. Root cause: `unmountedRef.current` was left as `true` after React Strict Mode double-mount cleanup, causing all monitoring callbacks to bail silently.
3. **No deduplication:** Each failed send attempt created a new DB row with identical content.

### Ad-hoc fix already applied

- `useStoryWriter.ts`: Added `unmountedRef.current = false` in effect setup (Strict Mode fix)
- `useStoryWriter.ts`: Added direct task status check during init; if task is already completed, applies result inline without SSE/polling

These fixes resolve the immediate hang, but the underlying issues (orphaned messages, no dedup, fragile monitoring) remain.

## Acceptance Criteria

### Phase 1: Message send atomicity

- [ ] If the agent POST (to create a workspace task) fails, roll back the user message from the database instead of leaving it orphaned
- [ ] Show a clear error in the chat UI: "Message could not be sent. Tap to retry." with a retry button on the failed message
- [ ] Retry button re-sends the same message content without creating a duplicate DB row
- [ ] If the page is reloaded while a message has no `workspaceTaskId`, show it with a "Not sent" indicator instead of displaying it as a normal message

### Phase 2: Duplicate send prevention

- [ ] Disable the send button and input while a message is in-flight (already partially done via `sending` state, but verify it covers all paths including quick prompts and AI action buttons)
- [ ] Add a client-side dedup check: if the last message in the conversation has identical content and was sent within the last 10 seconds, block the send and show a brief toast
- [ ] Server-side: the POST `/api/tickets/[key]/story-writer/messages` endpoint checks for a recent identical message (same content, same conversation, within 30s) and returns 409 instead of creating a duplicate

### Phase 3: Resume flow hardening

- [ ] The direct task-status check in init (current ad-hoc fix) handles errors gracefully: if `apply-draft` fails, show an error with a retry option instead of silently proceeding
- [ ] If the task status check returns a still-running task, fall through to `startMonitoring` (already works)
- [ ] `useTaskMonitoring`: when the 5-minute poll timeout fires, also close the EventSource (currently only polling stops)
- [ ] `useTaskMonitoring`: ensure `resultHandled` prevents true double-apply even under race between SSE and polling (current implementation is correct but add a test)

### Phase 4: Conversation cleanup

- [ ] Add a "Clear failed messages" action in the chat overflow menu that removes orphaned messages (messages with no `workspaceTaskId` and no following assistant response)
- [ ] On session discard/reset, orphaned messages are cleaned up automatically

## Technical Notes

- Message rollback: wrap the DB insert + agent POST in a transaction-like pattern. Since SQLite doesn't support distributed transactions with the agent, the simplest approach is: POST to agent first, only insert message on success. This inverts the current order but avoids orphans.
- Alternatively, keep the current order but add a `status` column to the message table (`pending`, `sent`, `failed`) and handle display/cleanup based on that. This preserves the message in case the user wants to retry.
- The dedup check should use a hash of (conversationId + content + timestamp-window), not exact string comparison, to handle whitespace normalization.
