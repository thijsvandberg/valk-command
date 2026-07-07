# BRDG-496: PO note visibility improvements

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

The PO note is a Bridge-local annotation on every ticket (stored as `ticketMetadata.po_notes`,
never synced to Jira). Currently it sits collapsed at the bottom of the sidebar, behind a
click. The goal is to make it immediately visible without user action, add a meaningful
placeholder, and visually surface its connection to the bookmark system.

## Current Behaviour

- The PO note lives in the **footer of the sidebar** (`TicketMetaContent.tsx` lines 900-946),
  below the spacer that pushes footer sections to the bottom.
- It is rendered as a **collapsible accordion**: clicking the "PO Note" heading expands a
  `<textarea>`. A small blue dot indicates a non-empty note when collapsed.
- Current placeholder: `"Quick annotation..."` (line 939).
- The note shares the same `po_notes` DB column as the bookmark quick-note
  (`schema.ts` line 139, comment at 140-142). `BookmarkNoteCard.tsx` pre-fills and patches
  this field; edits from either surface reach the other via `patchTicketCaches`.
- There is no visual link between the PO note and the bookmark indicator in the UI.

## Proposed Approach

Three independent, shippable improvements (can be split across PRs or done together):

1. **Always-visible, no collapse** — remove the accordion mechanic; render the textarea (or
   a read-only preview that expands on click) without requiring the header click. A note that
   must be opened cannot be called "prominent."

2. **Placeholder copy** — replace `"Quick annotation..."` with something that reflects the
   field's purpose, e.g. `"Your private note on this ticket. Also shown on the Bookmarks
   page."` (exact copy TBD by implementer based on available space).

3. **Bookmark badge / link** — when `ticket.bookmarkedAt` is set, show a bookmark indicator
   adjacent to the PO Note section head that clarifies the two fields are shared. This could
   be a small icon, a label, or a link to the Bookmarks page. Exact treatment left open.

Non-goals for this story:
- Moving the note to the main content area (above the description) is explicitly parked as
  an open question; the sidebar remains the default target.
- No changes to the data model, API, or persistence logic.
- No changes to `BookmarkNoteCard.tsx`.

## Open Questions

- **Where exactly should the note appear?** Default: keep in the sidebar, make always-visible
  and move it higher (above the Jira metadata fields, or at least above the Confluence/Dev
  sections). Alternative: surface it in the main content area above the description — more
  prominent but more intrusive. The PO deferred this decision; implementer should pick the
  sidebar-top option unless told otherwise.

- **Bookmark link: what interaction?** A passive indicator (bookmark icon) or an active link
  to `/bookmarks?ticket=KEY`? Default: passive icon next to the section header, no navigation.

## Acceptance Criteria

- [ ] The PO note is visible on ticket open without any user interaction (no accordion click required).
  <!-- TicketMetaContent.tsx — remove `poNoteExpanded` state and the collapsible wrapper; render textarea directly -->
- [ ] When the note is empty, a placeholder is shown that communicates the field's purpose and its
  relation to the Bookmarks page.
  <!-- TicketMetaContent.tsx textarea `placeholder` attribute -->
- [ ] When the ticket is bookmarked (`ticket.bookmarkedAt` is non-null), a visual indicator is shown
  near the PO Note that communicates the shared-field relationship with the bookmark system.
  <!-- TicketMetaContent.tsx — check `ticket.bookmarkedAt`; render badge/icon next to section header -->
- [ ] Editing behaviour (onChange local, onBlur persist, optimistic cache patch) is unchanged.
  <!-- handleNotesChange and patchTicketCaches must not be modified -->

## Tests

- [ ] Render test: PO Note textarea visible on mount without toggling the header.
  <!-- TicketMetaContent.test.tsx — assert textarea present without click -->
- [ ] Render test: placeholder text present when `ticket.notes` is empty.
  <!-- same file -->
- [ ] Render test: bookmark indicator present when `ticket.bookmarkedAt` is set, absent when null.
  <!-- same file -->

## Related

- `src/components/ticket-detail/TicketMetaContent.tsx` — all PO note UI lives here
- `src/db/schema.ts` line 139 — `po_notes` column (shared with bookmark)
- `src/components/shared/BookmarkNoteCard.tsx` — bookmark-time quick-note (shares same field)
- `src/lib/bookmarks.ts` — bookmark query that joins `po_notes`
- [[BRDG-495-bookmark-buckets]] — active bookmark work; coordinate if that story touches `BookmarkNoteCard`
