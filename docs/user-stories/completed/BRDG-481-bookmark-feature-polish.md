# BRDG-481: Bookmark feature polish (minor gaps from review)

**Status:** Backlog
**Priority:** Low
**Type:** Polish

## Description

Small consistency/polish gaps found while reviewing the bookmarks feature (BRDG-355 / BRDG-475). None are blocking; bundled here so they can be picked up together.

## Items

1. **[DONE] Bookmarking an epic was invisible.** The toggle is available on any detail header incl. epics, but `getBookmarks()` filtered out epics so a bookmarked epic never appeared in the launcher or `/bookmarks`. Fixed: `getBookmarks()` now keeps epics (subtasks still excluded), and the `/bookmarks` page fetches bookmarked epic keys separately (`useTicketsByKeys`) and merges them, since the board's `/api/tickets` feed excludes epics. Known minor edge: if the ONLY bookmarks are epics, the page can briefly flash the empty state while the epics hydrate.

2. **[DONE] Story Writer bookmark toggle failed silently.** `StoryWriterLayout` now uses `useToast` + `Toast` and shows "Could not bookmark this story" / "Could not remove the bookmark" on a failed write, matching the ticket-detail header. (`src/components/story-writer/StoryWriterLayout.tsx`.)

3. **[DONE] Note-hover showed the full note, not a snippet.** The launcher `BookmarkRow` now clamps the note to a 180-char snippet (with `…`) for the `Tooltip`, so a long note no longer produces an oversized tooltip; the note icon still shows for any non-empty note. (`src/components/nav/BookmarksView.tsx`.)

4. **[ACCEPTED] `/bookmarks` page hydrates from the whole `__all__` backlog.** Kept deliberately: the `__all__` feed shares the SWR cache with the sprint board (app home), so it is warm on virtually every visit and a cold `/bookmarks` load reuses it. A by-keys refactor would swap one warm shared list for uncapped, uncached per-bookmark requests and lose the error/loading/mutate wiring — not a net win for a single-user app. A comment at the `useTickets("__all__")` call records the decision. (`src/app/(app)/bookmarks/page.tsx`.)

## Implementation Plan

Item 1 (epics) is already done and committed. Remaining:

1. **Item 3 — snippet in launcher hover** (`src/components/nav/BookmarksView.tsx`): add a module-scope snippet helper (cap ~180 chars, append `…` when truncated) and use it for the `Tooltip` content in `BookmarkRow`. The note icon still shows for any non-empty note. Test in `BookmarksView.test.tsx`: a long note renders truncated with `…`; a short note stays in full.
2. **Item 2 — Story Writer toggle feedback** (`src/components/story-writer/StoryWriterLayout.tsx`): import `useToast` + `Toast`, add `const { toast, showToast, dismissToast } = useToast()`, and in `handleBookmarkToggle`'s `catch` call `showToast(next ? "Could not bookmark this story" : "Could not remove the bookmark")` (same copy as the ticket-detail header) with `showToast` added to the deps. Render `{toast && <Toast toast={toast} onDismiss={dismissToast} />}` as the last child of the outer flex div. Test in `StoryWriterLayout.test.tsx`: a synced ticket whose `setBookmarked` rejects surfaces the failure toast.
3. **Item 4 — `/bookmarks` full-backlog hydration**: ACCEPTED with a note (per the AC escape hatch). The board's `__all__` SWR cache is warm/shared (board is app home), so cold-load reuses it; a by-keys refactor would replace one warm cached list with uncapped, uncached per-bookmark requests and require re-wiring error/loading/mutate — not a net win for a single-user app. Add a short comment at the `useTickets("__all__")` call recording the decision.

Order: item 3, then item 2, then item 4.

## Acceptance Criteria

- [x] A bookmarked epic appears in both the launcher quick-list and the `/bookmarks` page; subtasks stay excluded.
- [x] Story Writer bookmark toggle gives feedback on failure.
- [x] Long PO notes render as a truncated snippet in the launcher hover.
- [x] `/bookmarks` cold-load no longer requires the full backlog fetch (explicitly accepted with a note: the `__all__` cache is warm/shared with the board).

## Related

- [[BRDG-355-bookmark-story-for-reference]]
- [[BRDG-475-quick-note-on-bookmark]]
