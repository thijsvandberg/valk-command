# BRDG-174: Ticket Context Chat in Refinement and Ticket View

**Status:** Open
**Priority:** Medium
**Related:** BRDG-127 (Refinement Session Mode), BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want a chat side pane in the refinement session (and ticket detail view) that has the current ticket's context, so I can ask questions about the story, get clarifications, or brainstorm subtasks without switching to the main chat view.

## Context

The existing chat system supports conversations with workspace context. This story adds a lightweight chat pane that automatically includes the ticket's description, acceptance criteria, and metadata as context. All messages for a given ticket are stored as a single conversation, so they appear in the main chat list under one entry for that ticket.

## Acceptance Criteria

### Chat side pane (refinement session)

- [ ] Chat icon button in the session top bar (next to Notes and Subtasks toggles)
- [ ] Opens a side pane (right side) with a chat interface
- [ ] Chat input at the bottom, messages above (same UX as main chat)
- [ ] Messages stream in real-time (SSE, same as main chat)

### Chat side pane (ticket detail view)

- [ ] Same chat button available from the ticket detail sidebar or header
- [ ] Opens the same chat pane with the same conversation

### Ticket context

- [ ] Each ticket gets its own conversation (or reuses an existing one for that ticket key)
- [ ] The conversation automatically includes the ticket's description, subtasks, and metadata as system context
- [ ] Conversation title is set to the ticket key + title (e.g. "VPL-45790: Switch bookingtool...")

### Chat list integration

- [ ] Conversations created from refinement/ticket view appear in the main chat list
- [ ] They are tagged or visually labeled as ticket conversations
- [ ] Opening them in the main chat view shows the full history

## Technical Notes

- Reuse `ChatLayout` / `ChatBubble` components in a narrower side pane format
- Create conversation via `POST /api/conversations` with ticket context injected as system message
- Look up existing conversation for a ticket by a metadata field (e.g. `ticketKey` on the conversation)
- The pane should be independent of the PO Notes and Subtask panes (tabbed or stacked side panel)

## Out of Scope

- Multi-user chat (only PO talks to the workspace)
- Voice/video integration
- Chat history search within the refinement view
