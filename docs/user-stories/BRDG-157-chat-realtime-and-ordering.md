# BRDG-157: Chat Real-Time Updates and Message Ordering

**Status:** Draft
**Priority:** High

## Description

As the PO, I want chat messages to always appear in correct chronological order and new conversations/messages to appear automatically without refreshing, so I have a reliable, real-time view of all workspace activity.

## Current Behavior

- Messages within a conversation are ordered by `timestamp` (TEXT field, `datetime('now')`). When multiple messages arrive in the same minute, their relative order is unpredictable because SQLite's `datetime('now')` only has second-level precision and rapid inserts can share the same timestamp.
- The conversation list is fetched once on mount. New conversations created by the workspace do not appear until the user manually refreshes the page.
- Messages within an open conversation are fetched once on mount. New assistant messages only appear after a workspace task completes and triggers an explicit `refreshMessages()` call. If the user sends a message from another device/tab, or a background job creates a conversation, nothing updates.
- There is no polling or subscription for the conversation list or for incoming messages in the active conversation.

## Desired Behavior

### 1. Fix message ordering

- [ ] Add a sequential `sequence` (INTEGER, auto-increment per conversation) column to the `message` table, set on insert
- [ ] Order messages by `sequence` instead of `timestamp` to guarantee stable chronological order regardless of timestamp collisions
- [ ] Migration: backfill existing messages with sequence numbers based on `(conversationId, timestamp, id)` ordering
- [ ] Update the API query in `GET /api/conversations/[id]` to `orderBy(message.sequence)`

### 2. Conversation list polling

- [ ] Add a polling interval (every 5 seconds) to `useConversations` that fetches the conversation list
- [ ] Use a lightweight endpoint or `If-Modified-Since` / ETag pattern to avoid unnecessary re-renders when nothing changed
- [ ] New conversations appear in the sidebar automatically within 5 seconds
- [ ] Active conversation highlight is preserved across refreshes
- [ ] Scroll position in the sidebar is preserved across refreshes

### 3. Active conversation message polling

- [ ] Add a polling interval (every 3 seconds) to `useMessages` for the currently active conversation
- [ ] Only poll when the conversation has a running workspace task or received a new message in the last 60 seconds (avoid unnecessary polling for idle conversations)
- [ ] New messages appear automatically in the message list
- [ ] Auto-scroll to bottom when new messages arrive (only if user was already at the bottom)
- [ ] Preserve scroll position if user has scrolled up to read history

### 4. Optimistic updates

- [ ] When the user sends a message, immediately append it to the local message list before the API responds
- [ ] Show a subtle "sending" indicator on the optimistic message until the API confirms
- [ ] On API error, mark the message as failed with a retry option

## Technical Notes

- The `sequence` column should be a simple integer. On insert, set it to `MAX(sequence) + 1` for the conversation, or 1 if first message. This avoids relying on timestamp precision.
- Polling is simpler than SSE for this use case since we already have SSE only for workspace task streaming. A future upgrade to full SSE push is possible but not in scope here.
- The polling intervals (5s conversations, 3s messages) should be configurable constants at the top of the respective hooks.
- Conversation list polling should compare response data (e.g., hash or updatedAt) before triggering a state update to avoid unnecessary re-renders.

## Out of Scope

- Full SSE/WebSocket push for messages (future improvement)
- Cross-tab synchronization
- Typing indicators
- Read receipts

## Acceptance Criteria

- [ ] Messages always display in correct insertion order, even when timestamps are identical
- [ ] A conversation created by the workspace appears in the sidebar within 5 seconds without user action
- [ ] A message added to the active conversation appears within 3 seconds without user action
- [ ] Sending a message shows it immediately (optimistic) before server confirmation
- [ ] No visible scroll jumps or loss of scroll position during polling updates
- [ ] All existing chat tests pass, new tests cover the polling and ordering logic
