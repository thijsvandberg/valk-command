# BRDG-154: Conversation Read/Unread Status & Bulk Actions

**Status:** Draft
**Priority:** High

## Description

As the PO, I want to track which conversations have new content I haven't seen and be able to manage multiple conversations at once (delete, mark read/unread), so I can stay on top of workspace activity without clicking through every conversation one by one.

Currently the only "unread" signal is the running-task dot, which disappears once the task completes. If I step away and come back, I have no idea which conversations received new messages.

## Current Behavior

- No read/unread tracking exists
- The pulsing blue dot indicates a running task, not unread content
- Conversations can only be deleted one at a time via a hover trash icon
- No multiselect capability

## Desired Behavior

### Read/unread status

- A conversation is marked **unread** when a new assistant message arrives (via workspace task completion or SSE)
- A conversation is marked **read** when the user opens it (selects it in the list)
- Unread conversations show a visual indicator: bold title text + unread dot
- The user can manually toggle read/unread on any conversation (right-click or action menu)

### Multiselect mode

- A "Select" button or long-press gesture activates multiselect mode
- In multiselect mode, each conversation row shows a checkbox
- A floating action bar appears at the bottom of the list with available actions:
  - **Delete** selected conversations
  - **Mark as read** selected conversations
  - **Mark as unread** selected conversations
- A "Select all" / "Deselect all" toggle in the action bar
- Pressing Escape or the close button exits multiselect mode
- Count of selected items is shown in the action bar

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Exit multiselect mode |
| `Ctrl/Cmd + A` | Select all (when in multiselect mode) |

## Acceptance Criteria

- [ ] New assistant messages mark the conversation as unread
- [ ] Opening a conversation marks it as read
- [ ] Unread conversations are visually distinct (bold title + dot)
- [ ] User can manually toggle read/unread status on a single conversation
- [ ] Multiselect mode can be activated via a button in the list header
- [ ] Checkboxes appear on each row in multiselect mode
- [ ] Bulk delete works for selected conversations
- [ ] Bulk mark-as-read works for selected conversations
- [ ] Bulk mark-as-unread works for selected conversations
- [ ] "Select all" / "Deselect all" toggle works
- [ ] Escape exits multiselect mode
- [ ] Selected count is displayed in the action bar
- [ ] Delete confirmation dialog shown before bulk delete

## Technical Notes

### Database changes

Add a `readAt` column to the `conversation` table:

```sql
ALTER TABLE conversation ADD COLUMN readAt TEXT;
```

- `readAt` is NULL for unread conversations, ISO timestamp for read ones
- Compare `readAt` against the latest message timestamp to determine unread state
- Alternative: a `lastMessageAt` column on conversation for efficient comparison without joining messages

### API changes

- `PATCH /api/conversations/[id]` already supports updates; extend to accept `readAt`
- New: `PATCH /api/conversations/bulk` for bulk operations:
  - Body: `{ ids: string[], action: "delete" | "markRead" | "markUnread" }`
  - Returns: `{ updated: number }`

### Unread detection

When a workspace task completes and the assistant message is persisted, set the conversation's `readAt` to NULL (if the conversation is not currently active). The active conversation ID is known client-side; pass it as a header or skip the unread flag for the currently viewed conversation.

### Key files

- `src/components/chat/ConversationList.tsx` (list rendering, selection state)
- `src/components/chat/ChatLayout.tsx` (mark-as-read on conversation select)
- `src/app/api/conversations/[id]/route.ts` (PATCH handler)
- `src/db/schema.ts` (schema change)
- `src/hooks/useConversations.ts` (add bulk operations, unread state)

## Out of Scope

- Notification badges outside the chat view (e.g., sidebar nav badge)
- Push notifications or browser notifications
- Per-message read tracking (only conversation-level)
