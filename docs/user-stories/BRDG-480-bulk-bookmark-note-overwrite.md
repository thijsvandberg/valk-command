# BRDG-480: Bulk bookmark note appends instead of overwriting existing PO notes

**Status:** Done
**Priority:** Medium
**Type:** Bug / UX fix

## Description

When several stories are bookmarked at once (bulk bar), the quick-note capture card (BRDG-475) writes **one shared note to every selected story**. That write was a plain `poNotes` **replace**, so any story in the selection that already had a PO note got it **silently overwritten** — a silent data-loss path with no warning and no undo.

## Decision (PO)

**Append** the shared note to any existing PO note instead of replacing it. Never lose existing content. (Single-item capture is unchanged: it pre-fills the existing note so the PO edits in place.)

## Implementation

- `src/components/shared/BookmarkNoteCard.tsx` → `commit()`: for a bulk capture (`isBulk`), each target is fetched via `getMetadata`; if it already has a `poNotes`, the shared note is appended as `existing + "\n\n" + value`; otherwise the plain note is written. Single-item still writes the (pre-filled, edited-in-place) value as-is. A failed metadata fetch falls back to writing just the typed value, so a note is never silently dropped.
- The optimistic board note-marker patch stays synchronous for every target; the appended text is re-patched once the existing note is known.

## Acceptance Criteria

- [x] Bulk bookmarking with a shared note never overwrites an existing PO note (it appends).
- [x] A target with no existing note gets just the shared note.
- [x] Single-item capture behaviour (pre-fill + edit in place) is unchanged.
- [x] Tests cover a bulk set mixing empty and non-empty existing notes.

## Related

- [[BRDG-475-quick-note-on-bookmark]] — introduced the shared-note-on-bulk behaviour this fixes.
- [[BRDG-355-bookmark-story-for-reference]] — the note reuses `poNotes`.
