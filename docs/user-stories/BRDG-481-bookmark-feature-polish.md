# BRDG-481: Bookmark feature polish (minor gaps from review)

**Status:** Backlog
**Priority:** Low
**Type:** Polish

## Description

Small consistency/polish gaps found while reviewing the bookmarks feature (BRDG-355 / BRDG-475). None are blocking; bundled here so they can be picked up together.

## Items

1. **[DONE] Bookmarking an epic was invisible.** The toggle is available on any detail header incl. epics, but `getBookmarks()` filtered out epics so a bookmarked epic never appeared in the launcher or `/bookmarks`. Fixed: `getBookmarks()` now keeps epics (subtasks still excluded), and the `/bookmarks` page fetches bookmarked epic keys separately (`useTicketsByKeys`) and merges them, since the board's `/api/tickets` feed excludes epics. Known minor edge: if the ONLY bookmarks are epics, the page can briefly flash the empty state while the epics hydrate.

2. **Story Writer bookmark toggle fails silently.** The ticket-detail header now shows a toast when a bookmark write fails (fixed in review); `StoryWriterLayout.handleBookmarkToggle` still only reverts the icon with no feedback, because Story Writer has no toast infrastructure. Add minimal feedback there for parity. (`src/components/story-writer/StoryWriterLayout.tsx`.)

3. **Note-hover shows the full note, not a snippet.** The launcher `BookmarkRow` renders the entire `poNotes` (up to 5000 chars) in a `Tooltip`. A long note produces an oversized tooltip. Truncate to a reasonable snippet (the BRDG-355 plan said "snippet"). (`src/components/nav/BookmarksView.tsx`.)

4. **`/bookmarks` page hydrates from the whole `__all__` backlog.** The full page fetches the entire board list (`useTickets("__all__")`, ~9k tickets) to hydrate a handful of bookmark rows with readiness/scores. It reuses the board's shared cache so it is not an extra fetch if the board was visited, but it is heavy on a cold load. Consider serving the page from the lightweight `/api/bookmarks` payload plus a targeted by-keys detail fetch, per `docs/architecture/client-data-and-memory.md`. (`src/app/(app)/bookmarks/page.tsx`.)

## Acceptance Criteria

- [x] A bookmarked epic appears in both the launcher quick-list and the `/bookmarks` page; subtasks stay excluded.
- [ ] Story Writer bookmark toggle gives feedback on failure.
- [ ] Long PO notes render as a truncated snippet in the launcher hover.
- [ ] `/bookmarks` cold-load no longer requires the full backlog fetch (or this is explicitly accepted with a note).

## Related

- [[BRDG-355-bookmark-story-for-reference]]
- [[BRDG-475-quick-note-on-bookmark]]
