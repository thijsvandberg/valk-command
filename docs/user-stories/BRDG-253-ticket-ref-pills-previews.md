# BRDG-253: Ticket-reference pills in version preview and story-writer previews

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

Follow-up to [BRDG-248](BRDG-248-ticket-ref-pills-chat-comments-editors.md), which enabled `TicketRefPill` linkification in chat and comments. This story covers the remaining read-only preview surfaces that BRDG-248 deferred: the **description version-history preview** and the **story-writer draft/diff/related-story previews**.

## Context

- BRDG-247 added linkification to the shared `renderMarkdown()` (`src/components/ticket-detail/renderMarkdown.tsx`) behind an opt-in `linkifyRefs` flag, fully built and tested in `renderMarkdown.test.tsx`. Enabling a surface is a matter of passing `{ linkifyRefs: true }` at its call site.
- Deferred preview call sites:
  - Version preview: `src/components/ticket-detail/VersionPreview.tsx:110`
  - Story-writer draft preview (chat draft expander): `src/components/story-writer/ChatMessageParts.tsx:505` (`draftContent`)
  - Story-writer "Current draft" card: `src/components/story-writer/ChatMessageParts.tsx` `DraftCard` (line ~605)
  - Diff pane: `src/components/story-writer/DiffPane.tsx:173`
  - Related stories panel: `src/components/story-writer/RelatedStoriesPanel.tsx:252`
  - Story preview app: `src/components/story-writer/panes/apps/StoryPreviewApp.tsx:31`
  - Draft preview app: `src/components/story-writer/panes/apps/DraftPreviewApp.tsx:74`

## Open questions (need PO input)
- Do previews of *in-progress, still-editable* draft content benefit from interactive pills, or is plain text clearer while a draft is being shaped? **PO decision: enable pills on draft previews.**
- Should the diff pane linkify both sides, or could pills obscure a textual diff? **PO decision: keep the diff pane OFF (pills would compete with the textual diff).**

## Implementation Plan

Scope per PO decision: enable `linkifyRefs` on **stable read-only views** (version preview, related-stories panel, story preview app) and **in-progress draft previews** (chat draft expander, `DraftCard`, draft preview app). Leave the **diff pane** off. The engine and pill exclusions are already built and tested in `renderMarkdown.test.tsx`; this is pure call-site threading + call-site tests + docs.

1. **Edits (one-arg → two-arg, pass `{ linkifyRefs: true }`):**
   - `src/components/ticket-detail/VersionPreview.tsx:110` — `renderMarkdown(version.content)`
   - `src/components/story-writer/RelatedStoriesPanel.tsx:252` — `renderMarkdown(data.description)`
   - `src/components/story-writer/panes/apps/StoryPreviewApp.tsx:31` — `renderMarkdown(content)`
   - `src/components/story-writer/ChatMessageParts.tsx:505` — `renderMarkdown(draftContent)` (chat draft expander)
   - `src/components/story-writer/ChatMessageParts.tsx:605` — `renderMarkdown(content)` (`DraftCard`)
   - `src/components/story-writer/panes/apps/DraftPreviewApp.tsx:74` — `renderMarkdown(draftPreviewContent.content)`
   - `src/components/story-writer/DiffPane.tsx:173` — leave OFF; add an inline comment noting the intentional exclusion (BRDG-253).
2. **Tests (mirror BRDG-248: mock `renderMarkdown`, assert `data-linkify="true"`):**
   - New: `VersionPreview.test.tsx`, `StoryPreviewApp.test.tsx`, `DraftPreviewApp.test.tsx` (apps need `WriterContext`/`PaneContext` mocks — copy `ChatApp.test.tsx` pattern).
   - Modify: `RelatedStoriesPanel.test.tsx` (add `data-linkify` to existing mock + a positive test); `ChatMessageParts.test.tsx` (flip the existing "does NOT linkify the draft preview" test to assert `true`).
3. **Commit order:** (1) version preview + docs; (2) related-stories panel + story/draft preview apps + DiffPane annotation; (3) ChatMessageParts both sites + test flip.
4. **Docs:** update `docs/architecture/jira-sync.md` linkification note — move the newly enabled surfaces into "Enabled", keep DiffPane in "Intentionally left off".

## Requirements

### 1. Enable linkification in the chosen preview surfaces
- Pass `{ linkifyRefs: true }` to `renderMarkdown` at the agreed call sites.
- Add call-site tests asserting the flag is threaded (mirror the BRDG-248 spy-on-`renderMarkdown` approach).

## Checklist
- [x] Decide (with PO) which preview surfaces should get pills <!-- PO decision: stable read-only views (version preview, related stories, story preview app) + in-progress draft previews (chat draft expander, DraftCard, draft preview app). Diff pane stays OFF. -->
- [x] (If yes) enable `linkifyRefs` in the chosen preview call sites + call-site tests
- [x] Update docs (`jira-sync.md`) to list the newly covered preview surfaces
