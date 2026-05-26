# BRDG-189: Preserve images in Jira descriptions during local edit and push

**Status:** Not Started
**Priority:** High
**Source:** VPL-45932

## Description

As a PO editing a Jira ticket locally in Bridge, I want images embedded in the Jira description to be preserved when I push my changes back, so that screenshots and visual context are not lost.

## Problem

When a Jira description contains embedded images (media nodes in ADF), the current edit-and-push flow destroys them:

1. **Sync from Jira:** `adfToMarkdown()` converts media nodes to `![alt](attachment)` with a hardcoded placeholder URL, losing the Jira file ID entirely.
2. **Local editing:** The markdown is stored in `ticketLocalEdit.localValue` with no media metadata preserved.
3. **Push to Jira:** `markdownToAdf()` has no image parser at all. The `![alt](attachment)` syntax is treated as plain text, so Jira receives the literal string instead of a media node.

Result: every image in the description is replaced by broken text after a push, even if the user only edited surrounding copy.

## Acceptance Criteria

- [ ] **Round-trip safety:** A description containing Jira media nodes survives a pull-edit-push cycle without image loss (even when the user does not touch the image area)
- [ ] **ADF-to-markdown preserves media identity:** `adfToMarkdown()` encodes enough information (file ID, collection, media type) in the markdown output so it can be reconstructed on push
- [ ] **Markdown-to-ADF restores media nodes:** `markdownToAdf()` parses image syntax and produces valid ADF `mediaSingle` / `media` nodes with the original Jira file references
- [ ] **Unmodified images pass through unchanged:** If a user edits text but does not touch an image, the pushed ADF contains the exact same media node as the original
- [ ] **Tests cover image round-trip:** Unit tests for `adfToMarkdown` and `markdownToAdf` verify media node preservation
- [ ] **Existing descriptions with images are not corrupted** by the migration (no data change needed, just code change)

## Technical Notes

### Affected files

| File | Issue |
|------|-------|
| `src/lib/adf-to-markdown.ts` | Media case hardcodes `(attachment)` URL, drops file ID |
| `src/lib/markdown-to-adf.ts` | `parseInline()` has no image/media pattern |
| `src/services/ticket-service.ts` | Push path calls `markdownToAdf()` without media context |

### Suggested approach

1. **Encode media metadata in markdown.** In `adfToMarkdown()`, output something like `![alt](jira-media://fileId/collection)` so the file reference survives the markdown round-trip.
2. **Parse image syntax in `markdownToAdf()`.** Add a regex for `![alt](src)` in `parseInline()`. When the URL starts with `jira-media://`, reconstruct the ADF media node with the original file ID and collection. For regular URLs, produce a standard ADF media or inline card node.
3. **Preserve raw media metadata.** Consider storing the original ADF media nodes alongside the markdown in `ticketLocalEdit` (e.g. a `mediaMetadata` JSON field) so there is no lossy conversion.

### Key code paths

- Pull: `upsertIssue()` in `src/lib/upsert-issue.ts` calls `adfToMarkdown()`
- Push: `pushToJira()` in `src/services/ticket-service.ts` calls `markdownToAdf()`
- Local edit storage: `ticketLocalEdit` table in `src/db/schema.ts`
- Rich editor: `src/components/rich-editor/RichEditor.tsx` (TipTap with Image extension already configured)

## Dependencies

None
