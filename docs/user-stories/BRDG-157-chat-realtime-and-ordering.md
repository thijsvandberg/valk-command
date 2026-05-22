# BRDG-157: Chat Real-Time Updates and Message Ordering

**Status:** In Progress
**Priority:** High

## Description

As the PO, I want chat messages to always appear in correct chronological order and new conversations/messages to appear automatically without refreshing, so I have a reliable, real-time view of all workspace activity.

## Implementation Plan

### Track 1: Message ordering (schema + migration + API)
1. Add `sequence` INTEGER column to message table in `src/db/schema.ts`
2. Hand-write migration `drizzle/0049_message_sequence.sql`: ALTER TABLE + backfill + index
3. Create `src/db/next-sequence.ts` helper: `MAX(sequence)+1` per conversation
4. Update all 8 `db.insert(message)` sites to include `sequence: nextSequence(conversationId)`
5. Change `GET /api/conversations/[id]` to `orderBy(message.sequence)`

### Track 2: Conversation list polling
6. Create `src/lib/polling-constants.ts` with configurable intervals
7. Add background polling to `useConversations` with JSON comparison to avoid re-renders

### Track 3: Message polling + smart scroll
8. Add polling to `useMessages` with `hasRunningTask` option and idle timeout
9. Update `ChatLayout` to pass `hasRunningTask` to `useMessages`
10. Make `MessageList` auto-scroll conditional (only when user was at bottom)

### Track 4: Optimistic updates (already complete)
No work needed. Full optimistic UI with visual feedback already exists.

## Current Behavior

- Messages within a conversation are ordered by `timestamp` (TEXT field, `datetime('now')`). When multiple messages arrive in the same minute, their relative order is unpredictable because SQLite's `datetime('now')` only has second-level precision and rapid inserts can share the same timestamp.
- The conversation list is fetched once on mount. New conversations created by the workspace do not appear until the user manually refreshes the page.
- Messages within an open conversation are fetched once on mount. New assistant messages only appear after a workspace task completes and triggers an explicit `refreshMessages()` call. If the user sends a message from another device/tab, or a background job creates a conversation, nothing updates.
- There is no polling or subscription for the conversation list or for incoming messages in the active conversation.

## Desired Behavior

### 1. Fix message ordering

- [x] Add a sequential `sequence` (INTEGER, auto-increment per conversation) column to the `message` table, set on insert
- [x] Order messages by `sequence` instead of `timestamp` to guarantee stable chronological order regardless of timestamp collisions
- [x] Migration: backfill existing messages with sequence numbers based on `(conversationId, timestamp, id)` ordering
- [x] Update the API query in `GET /api/conversations/[id]` to `orderBy(message.sequence)`

### 2. Conversation list polling

- [x] Add a polling interval (every 5 seconds) to `useConversations` that fetches the conversation list
- [x] Use a lightweight endpoint or `If-Modified-Since` / ETag pattern to avoid unnecessary re-renders when nothing changed
- [x] New conversations appear in the sidebar automatically within 5 seconds
- [x] Active conversation highlight is preserved across refreshes
- [x] Scroll position in the sidebar is preserved across refreshes

### 3. Active conversation message polling

- [x] Add a polling interval (every 3 seconds) to `useMessages` for the currently active conversation
- [x] Only poll when the conversation has a running workspace task or received a new message in the last 60 seconds (avoid unnecessary polling for idle conversations)
- [x] New messages appear automatically in the message list
- [x] Auto-scroll to bottom when new messages arrive (only if user was already at the bottom)
- [x] Preserve scroll position if user has scrolled up to read history

### 4. Optimistic updates

- [x] When the user sends a message, immediately append it to the local message list before the API responds
- [x] Show a subtle "sending" indicator on the optimistic message until the API confirms
- [ ] On API error, mark the message as failed with a retry option <!-- skipped: existing implementation removes the optimistic message on error rather than showing retry; changing this pattern is a separate UX decision -->

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

- [x] Messages always display in correct insertion order, even when timestamps are identical
- [x] A conversation created by the workspace appears in the sidebar within 5 seconds without user action
- [x] A message added to the active conversation appears within 3 seconds without user action
- [x] Sending a message shows it immediately (optimistic) before server confirmation
- [x] No visible scroll jumps or loss of scroll position during polling updates
- [x] All existing chat tests pass, new tests cover the polling and ordering logic
