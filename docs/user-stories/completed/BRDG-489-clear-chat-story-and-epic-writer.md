# BRDG-489: Clear chat in Story Writer & Epic Writer (button + /clear command)

**Status:** Done
**Priority:** Medium

## Status

Shipped 2026-07-06. A "Clear chat" button in the compose footer and a `/clear` compose command (swallowed - never sent to the AI or stored) both clear the conversation after a confirmation, in the shared `StoryWriterChat` (Story Writer, Epic Writer, and the in-place child writer). Backend: `clearConversationMessages` deletes all message rows for the active session's conversation; the ticket story-writer messages DELETE gained an `?all=true` variant and the epic writer messages route gained a matching DELETE. The session, draft (`localDraft`/local-edits), and breakdown cards are untouched (AI drafts survive via the `message_id` `ON DELETE SET NULL` FK). Verified E2E: Story Writer VPL-1337 cleared via `/clear` (7 -> 0 messages, 32k-char draft intact); Epic Writer VPL-47279 cleared via the button + `/clear` (30 -> 0 messages, 12 breakdown cards + draft intact); both routes returned 200, no console errors. Lint, typecheck, full suite, and build all green.

## Description

As the PO, I want to clear the chat conversation in the writer without losing my work, so a long chat stops bloating what gets sent to the AI on every turn and the assistant is not distracted by stale discussion. This applies to **both** the Story Writer and the Epic Writer, since they share the same chat.

Two entry points:
- A **"Clear chat" button** in the chat UI.
- A **`/clear` slash command** typed into the chat compose box (one word; it must be intercepted and NOT sent to the AI as a normal message).

## Why

Each turn re-sends the conversation as context (amplified for the Epic Writer breakdown flow by [BRDG-479](completed/BRDG-479-epic-writer-advance-to-breakdown.md), which prepends the chat history). Measured on epic `VPL-47279`: 29 messages ~= 29.5k chars (~7.4k tokens) re-sent per turn. Clearing removes that history. The work product survives a clear because it is stored separately from the chat:
- Epic Writer: breakdown cards in `epic_child_draft`, epic body in `story_writer_session.localDraft`.
- Story Writer: the draft in `localDraft` / local-edits.

So "Clear chat" resets only the conversation messages; the draft, breakdown cards, and session stay.

## In Scope

- Clear action that **deletes the conversation's messages** but KEEPS the session, draft (`localDraft`/local-edits), and any breakdown cards. After clearing, the next AI turn still has the story/epic context (+ breakdown state for epics), just no chat history.
- Available in both writers, in the shared chat component (`StoryWriterChat` is used by both).
- Button + `/clear` command both trigger the same action.
- **Confirm before clearing** (it discards discussion not captured in the draft/cards).
- Backend: a clear-all-messages operation for both conversation routes:
  - `/api/tickets/[key]/story-writer/messages` (Story Writer)
  - `/api/epics/[key]/writer/messages` (Epic Writer)
  extend the existing message DELETE (currently single-message via `?id=`) to a clear-all variant, or add a dedicated endpoint. Must NOT delete the session, drafts, or cards.
- After clearing, refresh so the chat shows empty and subsequent turns start a fresh history.

## Out of Scope

- Deleting/resetting the draft, breakdown cards, or the session (those are kept).
- Archiving/exporting the cleared chat (a plain clear is enough for now).
- Anything to do with Claude Code's own `/clear` - this is the in-app Bridge chat only.

## Notes / edge cases

- `/clear` typed in the compose box must be recognised exactly (trimmed) and swallowed - never persisted or sent as a user message.
- If a turn is in flight (streaming), either disable clear or cancel first, so we do not clear mid-response.
- Draft keys (`DRAFT-…`) and normal keys both supported.

## Acceptance Criteria

- [x] A "Clear chat" button and the `/clear` command both clear the current conversation's messages, after a confirmation.
- [x] Works in the Story Writer and the Epic Writer.
- [x] The draft, local edits, breakdown cards, and session are untouched by a clear.
- [x] After clearing, a new question works and starts from an empty history (context still includes the draft / breakdown state).
- [x] `/clear` is never sent to the AI or stored as a message.
- [x] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass.
