# BRDG-256: Ticket Chat Conversation Switching

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want to manage multiple chat conversations per ticket from the ticket chat sidebar, so that I can keep separate threads (e.g. one about scope, one about testing) instead of being locked into a single auto-created conversation.

Today the ticket chat pane (`TicketChatPane`) silently finds-or-creates one conversation per ticket on open (`POST /api/tickets/{key}/chat`). There is no way to start a fresh thread or revisit an earlier one. This is a follow-up to BRDG-211 (chat sidebar upgrade).

## Requirements

### 1. Choose: continue or start new on open

- When opening the chat for a ticket that already has one or more conversations, do not silently resume the latest. Let the PO choose to continue an existing conversation or start a new one.
- If the ticket has no conversations yet, open directly into a new conversation (no extra step).

### 2. Switch between conversations from the interface

- Provide an affordance in the chat pane header (e.g. a conversation dropdown/menu) to switch the active conversation without leaving the pane.
- Show enough context per conversation to tell them apart: a title or first-message snippet, and a last-activity timestamp.
- Switching loads that conversation's messages and continues streaming/sending against it.

### 3. Start a new conversation

- A clear "New conversation" action in the pane (e.g. in the same header menu).
- Starting a new conversation creates an empty thread and makes it active, without deleting or disturbing existing ones.

### 4. Persist the active conversation

- Remember which conversation was last active for a given ticket so reopening the pane returns to it (subject to requirement 1's choose-on-open behaviour, which should be decided during refinement).

## Out of scope

- Renaming or deleting conversations (could be a further follow-up)
- Conversation management outside the ticket chat pane (e.g. global chat view)
- Sharing conversations between tickets

## Open questions / to refine

- Auto-title generation vs first-message snippet vs manual titles.
- Exact UX of requirement 1: a small chooser on open, or default-to-latest with an easy "new" button. Validate with the PO.
- Backend: does the data model already support multiple conversations per ticket, or does `POST /api/tickets/{key}/chat` need a list endpoint and a create endpoint? Confirm the conversation schema and the `useMessages` / `useWorkspaceTask` wiring.

## Technical notes

- Chat pane: `src/components/shared/TicketChatPane.tsx`
- Current init: `POST /api/tickets/{key}/chat` (find-or-create) in the pane's effect
- Message loading: `useMessages(conversationId, ...)`; streaming: `useWorkspaceTask(conversationId)`
- Conversation schema lives in `src/db/schema.ts`; see `docs/architecture/database-schema.md`

## Checklist

- [ ] Confirm/extend backend: list conversations for a ticket + create-new endpoint
- [ ] Add conversation switcher to the chat pane header (list, snippet/title, last-activity)
- [ ] Add "New conversation" action
- [ ] Implement choose-on-open behaviour (continue vs new) when prior conversations exist
- [ ] Persist last-active conversation per ticket
- [ ] Tests: switcher rendering/selection, new-conversation flow, choose-on-open, persistence
- [ ] All tests pass, build succeeds
