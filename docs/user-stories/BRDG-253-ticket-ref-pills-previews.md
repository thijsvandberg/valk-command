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
- Do previews of *in-progress, still-editable* draft content benefit from interactive pills, or is plain text clearer while a draft is being shaped?
- Should the diff pane linkify both sides, or could pills obscure a textual diff?

## Requirements

### 1. Enable linkification in the chosen preview surfaces
- Pass `{ linkifyRefs: true }` to `renderMarkdown` at the agreed call sites.
- Add call-site tests asserting the flag is threaded (mirror the BRDG-248 spy-on-`renderMarkdown` approach).

## Checklist
- [ ] Decide (with PO) which preview surfaces should get pills
- [ ] (If yes) enable `linkifyRefs` in the chosen preview call sites + call-site tests
- [ ] Update docs (`jira-sync.md`) to list the newly covered preview surfaces
