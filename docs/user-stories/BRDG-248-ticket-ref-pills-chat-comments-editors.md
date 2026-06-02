# BRDG-248: Ticket-reference pills in chat, comments, and editors

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

Follow-up to [BRDG-247](completed/BRDG-247-linkify-vpl-keys-in-description.md), which turned bare `VPL-` references (and full Jira `/browse/` links) in the **ticket description** into interactive `TicketRefPill`s. This story extends that treatment to the other surfaces that were deliberately left out of BRDG-247:

1. **Chat and comments** (read-only rendered markdown) — low-risk, mirrors the description work.
2. **The rich editor** (TipTap, while *editing* text) — higher-risk; needs a proper editor node, not render-time replacement.

## Context

- BRDG-247 added linkification inside the shared `renderMarkdown()` (`src/components/ticket-detail/renderMarkdown.tsx`) behind an opt-in `linkifyRefs` flag, enabled **only** in `EditableDescription`. Detection covers bare `<projectKey>-\d+` in plain text (not in links/code/emphasis), plain text inside expandables, and full Jira `/browse/<KEY>` links. The pill is `TicketRefPill` rendered as the elevated chip (`appearance="elevated"`).
- Chat (`ChatMessageParts.tsx`), comments (`CommentsSection.tsx`), search results, version preview, and the story-writer previews all call the same `renderMarkdown()` — so enabling them is mostly a matter of passing `{ linkifyRefs: true }` at those call sites.
- The **editor** is different. `RichEditor` (`src/components/rich-editor/RichEditor.tsx`) is TipTap/contenteditable. Content is edited as live text and round-tripped to the stored markdown/ADF. `renderMarkdown` is **not** used while editing.

## The editor complication (answering "do we get tangled up editing text?")

Yes — naively replacing `VPL-123` text with a pill inside a contenteditable would tangle text editing. Doing it properly means treating the pill as a real editor node, not a visual swap:

- **Atomic inline node + NodeView.** The pill must be an atomic inline node so the caret, selection, and Backspace treat it as one unit (you delete the whole pill, you don't land *inside* `VPL-123`). A render-time decoration would break caret behaviour.
- **Input rule / paste rule.** Auto-convert `VPL-123` as it's typed, and convert a pasted `/browse/VPL-123` URL, into the node.
- **Markdown/ADF serialization.** On save, the node must serialize back to plain `VPL-123` text (or the original `/browse/` link) so the stored content is never corrupted and the existing ADF round-trip keeps working. This is the highest-risk part — get it wrong and edits silently mangle descriptions.
- **Editing affordance.** The PO must still be able to remove/retype a key; the node needs to be deletable and ideally convertible back to text.

Recommendation: keep the editor showing **plain text** while editing (status quo) and pills only in the rendered view. That sidesteps the tangle entirely — you edit `VPL-123` as text, it renders as a pill. Build the TipTap node as the explicit, well-tested unit of work below only if inline pills *while editing* are actually wanted.

## Requirements

### 1. Chat & comments (read-only)
- Enable `renderMarkdown(..., { linkifyRefs: true })` in `CommentsSection` and `ChatMessageParts` (and decide on search results / version preview / story-writer previews).
- Confirm the same exclusions hold (no conversion in code/links/emphasis); reuse BRDG-247 tests as a template.

### 2. Editor pills (TipTap node) — only if inline-while-editing is wanted
- Custom atomic inline node + NodeView rendering `TicketRefPill` (read-only inside the editor).
- Input rule (`VPL-123` typed) and paste rule (`/browse/VPL-123` pasted) to create the node.
- Markdown + ADF serialization back to plain text / browse link, verified by round-trip tests (type → save → reload shows identical stored content).
- Caret/Backspace/selection behaviour tests.

## Open questions (need PO input)
- Which read-only surfaces beyond chat/comments should get pills (search results, version preview, story-writer draft/diff previews)?
- Do we actually want pills **while editing** in the rich editor, or is "plain text when editing, pill when rendered" good enough? (The latter avoids all editor risk.)

## Out of scope
- Anything already shipped in BRDG-247 (description view, header pill, `/browse/` link conversion, the elevated pill style).

## Checklist
- [ ] Enable `linkifyRefs` in comments + chat render paths + tests
- [ ] Decide & (optionally) enable for search results / version preview / story-writer previews
- [ ] (If wanted) TipTap inline node + NodeView for the ref pill
- [ ] (If wanted) input rule + paste rule to create the node
- [ ] (If wanted) markdown + ADF serialization round-trip + tests
- [ ] (If wanted) caret / selection / delete behaviour tests
- [ ] Update docs (`jira-sync.md` reference-linkification note) to list the newly covered surfaces
