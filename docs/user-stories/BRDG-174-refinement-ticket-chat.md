# BRDG-174: Ticket Context Chat in Refinement and Ticket View

**Status:** Open
**Priority:** Medium
**Related:** BRDG-127 (Refinement Session Mode), BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want a chat side pane in the refinement session (and ticket detail view) that has the current ticket's context, so I can ask questions about the story, get clarifications, or brainstorm subtasks without switching to the main chat view.

## Context

The existing chat system supports conversations with workspace context. This story adds a lightweight chat pane that automatically includes the ticket's description, acceptance criteria, and metadata as context. All messages for a given ticket are stored as a single conversation, so they appear in the main chat list under one entry for that ticket.

## Implementation Plan

1. **Add "ticket-chat" category** to `src/lib/conversation-category.ts` (type, config, prefix map)
2. **Create API endpoint** `POST /api/tickets/[key]/chat/route.ts` that finds-or-creates a conversation for a ticket key (using `relatedTicket` field + `Ticket Chat:` title prefix), injecting ticket context as the first message
3. **Create `TicketChatPane` component** (`src/components/shared/TicketChatPane.tsx`) that calls the API on mount, uses `useMessages` + `useWorkspaceTask`, renders `ChatBubble` + `ChatInput` in a compact resizable side pane
4. **Integrate into refinement session**: add `chatPaneOpen` + `toggleChatPane()` to `RefinementSessionContext`, add Chat toggle button in top bar, render pane as third right-panel option
5. **Integrate into ticket detail view**: add chat toggle button in ViewHeader, render `TicketChatPane` as side panel
6. **Verify chat list integration**: ticket-chat conversations auto-appear in main chat list via existing `preparedConversationList` (they have messages + `relatedTicket`)

Design decisions:
- Conversations use `relatedTicket` column + `Ticket Chat:` title prefix to distinguish from Story Writer conversations
- Panel is mutually exclusive with Subtasks/Notes in refinement (follows existing `rightPanelMode` pattern)
- Context message is `role: "user"` (schema only supports user/assistant), rendered collapsed in the pane
- Same `useWorkspaceTask` + `chat-messages` endpoint for streaming (identical behavior to main chat)

## Acceptance Criteria

### Chat side pane (refinement session)

- [x] Chat icon button in the session top bar (next to Notes and Subtasks toggles)
- [x] Opens a side pane (right side) with a chat interface
- [x] Chat input at the bottom, messages above (same UX as main chat)
- [x] Messages stream in real-time (SSE, same as main chat)

### Chat side pane (ticket detail view)

- [x] Same chat button available from the ticket detail sidebar or header
- [x] Opens the same chat pane with the same conversation

### Ticket context

- [x] Each ticket gets its own conversation (or reuses an existing one for that ticket key)
- [x] The conversation automatically includes the ticket's description, subtasks, and metadata as system context
- [x] Conversation title is set to the ticket key + title (e.g. "VPL-45790: Switch bookingtool...")

### Chat list integration

- [x] Conversations created from refinement/ticket view appear in the main chat list
- [x] They are tagged or visually labeled as ticket conversations
- [x] Opening them in the main chat view shows the full history

## Technical Notes

- Reuse `ChatLayout` / `ChatBubble` components in a narrower side pane format
- Create conversation via `POST /api/conversations` with ticket context injected as system message
- Look up existing conversation for a ticket by a metadata field (e.g. `ticketKey` on the conversation)
- The pane should be independent of the PO Notes and Subtask panes (tabbed or stacked side panel)

## Out of Scope

- Multi-user chat (only PO talks to the workspace)
- Voice/video integration
- Chat history search within the refinement view
