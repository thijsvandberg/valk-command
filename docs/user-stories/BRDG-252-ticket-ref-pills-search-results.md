# BRDG-252: Ticket-reference pills in search results

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

Follow-up to [BRDG-248](BRDG-248-ticket-ref-pills-chat-comments-editors.md), which enabled `TicketRefPill` linkification in chat and comments. This story extends the same treatment to **sprint-board search results**, a surface deliberately deferred from BRDG-248 pending a PO decision on whether pills belong there.

## Context

- BRDG-247 added linkification to the shared `renderMarkdown()` (`src/components/ticket-detail/renderMarkdown.tsx`) behind an opt-in `linkifyRefs` flag. The detection and exclusion logic is fully built and tested in `renderMarkdown.test.tsx`; enabling a surface is a matter of passing `{ linkifyRefs: true }` at its call site.
- Search results render markdown at `src/components/sprint-board/SearchResultParts.tsx:171` (`renderMarkdown(result.description)`).

## Open questions (need PO input)
- Do pills add value in a search-result snippet, or do they clutter a dense, scannable list?
- Search snippets may be truncated/highlighted — confirm pills interact cleanly with truncation and any search-term highlighting.

## Requirements

### 1. Enable linkification in search results
- Pass `{ linkifyRefs: true }` to `renderMarkdown` at the `SearchResultParts` call site.
- Verify behaviour with truncated descriptions and any search-term highlighting.

## Checklist
- [ ] Decide (with PO) whether pills belong in search results
- [ ] (If yes) enable `linkifyRefs` in `SearchResultParts` + call-site test
- [ ] (If yes) verify truncation / highlight interaction
- [ ] Update docs (`jira-sync.md`) to list search results as a covered surface
