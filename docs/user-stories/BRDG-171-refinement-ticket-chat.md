# BRDG-171: Ticket Context Chat in Refinement

**Status:** Open
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish), BRDG-127 (Refinement Session Mode)

## Description

As the PO, I want a chat side pane in the refinement session that has the current ticket's context, so I can ask questions about the story, get clarifications, or brainstorm subtasks without switching to the main chat view.

## Context

The existing chat system supports conversations with workspace context. This story adds a lightweight chat pane to the refinement session that automatically includes the ticket's description, acceptance criteria, and metadata as context. All messages are stored as a single conversation per ticket, so they appear in the main chat list too.

## Acceptance Criteria

### Chat side pane

- [ ] Chat icon button in the session top bar or ticket header
- [ ] Opens a side pane (right side, similar to PO Notes panel) with a chat interface
- [ ] Chat input at the bottom, messages above (same UX as main chat)
- [ ] Messages stream in real-time (SSE, same as main chat)

### Ticket context

- [ ] Each ticket in the session gets its own conversation (or reuses an existing one for that ticket)
- [ ] The conversation automatically includes the ticket's description, subtasks, and metadata as system context
- [ ] Conversation title is set to the ticket key + title (e.g. "VPL-45790: Switch bookingtool...")

### Chat list integration

- [ ] Conversations created from refinement appear in the main chat list
- [ ] They are tagged/labeled as refinement conversations
- [ ] Opening them in the main chat view shows the full history

### Also available from ticket single view

- [ ] The same chat-with-ticket-context pattern should work from the ticket detail page (not just refinement)
- [ ] Button in ticket detail sidebar or header to open/continue the ticket's conversation

## Technical Notes

- Reuse `ChatLayout` / `ChatBubble` components in a narrower side pane format
- Create conversation via `POST /api/conversations` with ticket context injected as system message
- Look up existing conversation for a ticket by a metadata field (e.g. `ticketKey` on the conversation)
- The pane should be independent of the PO Notes pane (both can be open, or use a tabbed side panel)

## Out of Scope

- Multi-user chat (only PO talks to the workspace)
- Voice/video integration
- Chat history search within the refinement view
