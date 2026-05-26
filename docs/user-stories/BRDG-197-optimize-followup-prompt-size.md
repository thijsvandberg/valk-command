# BRDG-197: Optimize Story Writer Follow-up Prompt Size

**Status:** Not Started
**Priority:** High

## Description

As a PO using the Story Writer, I want follow-up messages to be processed faster by reducing unnecessary context sent to the AI, so that simple questions get quick answers instead of always taking 15-20 seconds.

## Problem

Every follow-up message in `buildFollowUpContent()` (`messages/route.ts:499-523`) includes:
- The full `localDraft` (can be 1000+ words for a mature story)
- A `[Remember: ...]` instruction block with 6+ directives
- Codebase research flag
- Split mode context

For a simple question like "wat is de story nr", all this extra context forces Claude to process thousands of unnecessary input tokens before generating a one-line answer.

## Acceptance Criteria

- [ ] Follow-up messages that don't reference the draft skip including `[Current story draft]` block
- [ ] Implement a lightweight heuristic to detect "draft-related" vs "simple question" messages (e.g., keywords like "improve", "add", "change", "rewrite" vs questions without edit intent)
- [ ] The `[Remember: ...]` instruction block is shortened or omitted for non-edit messages
- [ ] When draft context is needed, it is still included in full (no regression for edit workflows)
- [ ] Measure and log token count reduction for follow-up messages

## Technical Notes

- **File:** `src/app/api/tickets/[key]/story-writer/messages/route.ts` (function `buildFollowUpContent` at line 499)
- Heuristic approach: check if the message contains edit-intent keywords. If not, send a minimal prompt without draft context. If Claude needs the draft, it can reference conversation history via `--resume`.
- Alternative: always send a condensed draft summary (first 200 chars + structure outline) instead of the full draft, and let Claude request the full version if needed.
- The `--resume` flag already gives Claude access to the full conversation history, so the draft is arguably redundant for non-edit messages.

## Dependencies

None
