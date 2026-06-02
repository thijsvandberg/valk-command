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

## Implementation Plan

Scope per PO decisions: **chat & comments only**. No TipTap/editor work (plain text when editing, pill when rendered is good enough). The optional surfaces (search results, version preview, story-writer previews) become follow-up stories.

The linkification engine (`renderMarkdown(text, { linkifyRefs: true })`) and its exclusions are already fully built and tested in `renderMarkdown.test.tsx`. This story is purely: thread the flag at four comment/chat body call sites, add call-site tests proving the flag is passed (and NOT passed for draft previews), update docs, and file follow-ups.

1. **Enable `linkifyRefs` at the four in-scope call sites** (one-arg-to-two-arg change passing `{ linkifyRefs: true }`):
   - `CommentsSection.tsx` line 136 (PO comments) and line 223 (Jira comments — wrap the flag-stripping ternary as first arg).
   - `SessionTicketView.tsx` line 227 (refinement-session Jira comments).
   - `ChatMessageParts.tsx` line 420 (message body, expanded/truncated) and line 461 (`contentAfter`).
2. **Leave draft-preview call sites OFF** (out of scope, deferred): `ChatMessageParts.tsx` line 505 (`draftContent`) and line 605 (`DraftCard`). These render in-progress generated drafts, grouped with the deferred "story-writer previews."
3. **Tests — spy on `renderMarkdown`, assert the flag is threaded.** Pill rendering/exclusions are already covered in `renderMarkdown.test.tsx`, so call-site tests only verify the second arg.
   - `CommentsSection.test.tsx`: change mock to capture `opts`; add tests asserting PO + Jira comment renders pass `{ linkifyRefs: true }` (use a non-flag Jira comment for deterministic first arg).
   - `SessionTicketView.test.tsx`: capture `opts` in mock; assert Jira comment render passes the flag.
   - `ChatMessageParts.test.tsx`: add render-based tests for `ChatMessage` — positive flag on body (420/461), negative on draft (505/`DraftCard`). This is the main effort (no existing component-render test).
4. **Fetch-volume:** add no code. `TicketRefPill` already SWR-dedupes per key + server-caches, and `useJiraSprints` is shared. File a speculative investigation follow-up only.
5. **Docs:** update `docs/architecture/jira-sync.md` linkification note to list the newly covered surfaces (comments + chat) and what stays off (draft previews, editor).
6. **Follow-up stories:** search results; version preview + story-writer draft previews; (optional) batched ticket-ref lookup investigation.

## Requirements

### 1. Chat & comments (read-only)
- Enable `renderMarkdown(..., { linkifyRefs: true })` in `CommentsSection` and `ChatMessageParts` (and decide on search results / version preview / story-writer previews).
- Confirm the same exclusions hold (no conversion in code/links/emphasis); reuse BRDG-247 tests as a template.
- **Fetch volume:** each `TicketRefPill` lazily fetches `GET /api/tickets/[key]` (SWR-deduped per key) and calls `useJiraSprints` for the hover-card sprint name. Fine for a description's handful of refs, but chat/comments can contain many. For high-volume surfaces, prefer a shared lookup over the SWR-cached `/api/tickets` list (cf. `useTicketHoverData`) or batch the per-key calls, rather than one request per pill.

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
- [x] Enable `linkifyRefs` in comments + chat render paths + tests
- [x] Decide & (optionally) enable for search results / version preview / story-writer previews <!-- PO decision: out of scope; deferred to follow-up stories BRDG-252 (search results) and BRDG-253 (version preview + story-writer previews). -->
- [x] (If wanted) TipTap inline node + NodeView for the ref pill <!-- skipped: PO chose "plain text when editing, pill when rendered"; no editor pills. -->
- [x] (If wanted) input rule + paste rule to create the node <!-- skipped: editor pills not wanted (see above). -->
- [x] (If wanted) markdown + ADF serialization round-trip + tests <!-- skipped: editor pills not wanted (see above). -->
- [x] (If wanted) caret / selection / delete behaviour tests <!-- skipped: editor pills not wanted (see above). -->
- [x] Update docs (`jira-sync.md` reference-linkification note) to list the newly covered surfaces
