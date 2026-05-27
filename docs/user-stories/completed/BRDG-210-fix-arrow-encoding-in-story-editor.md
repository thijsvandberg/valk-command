# BRDG-210: Fix arrow encoding in story editor

**Status:** Done
**Priority:** High
**Type:** Bug fix

## Problem

When editing a story description in the single view, typing `->` gets saved as `-&gt;`. The `>` character is HTML-encoded because `DOMPurify.sanitize()` (an HTML sanitizer) was being applied to markdown text.

## Root cause

In `ticket-service.ts`, the `upsertLocalEdit()` function called `sanitizeHtml()` (which uses DOMPurify) on description content. DOMPurify treats input as HTML and encodes `>` to `&gt;`. The same issue affected `poNotes`.

## Fix

- [x] Remove `sanitizeHtml()` from description field in `upsertLocalEdit()` (line 269)
- [x] Remove `sanitizeHtml()` from `poNotes` field in `upsertPoMetadata()` (line 496)
- [x] Clean up unused import

## Why this is safe

- Description and poNotes are markdown, rendered via `renderMarkdown()` which uses React JSX (auto-escapes all text)
- No `dangerouslySetInnerHTML` is used for these fields
- Type validation and length limits are already in place
- HTML comments still use `sanitizeHtml()` (unchanged)
