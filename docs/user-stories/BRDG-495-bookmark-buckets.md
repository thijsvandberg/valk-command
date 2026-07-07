# BRDG-495: Bookmark buckets with drag-and-drop

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

The PO can create named containers ("buckets") on the `/bookmarks` page and drag bookmarked
tickets from one bucket to another. Buckets are PO-only, Bridge-local groupings — a lightweight
way to organise bookmarks beyond the single chronological list that exists today.

This story is intentionally high-level. Design details will be resolved before implementation
starts.

## Current Behaviour

- All bookmarked tickets are stored in `ticket_metadata.bookmarked_at` (ISO timestamp; null =
  not bookmarked). Ordering is `bookmarked_at DESC` — a single flat list.
- The `/bookmarks` page (`src/app/(app)/bookmarks/page.tsx`) renders all bookmarks as a flat
  `BoardRow` list, with no grouping.
- The launcher sidebar quick-list (`src/components/nav/BookmarksView.tsx`) shows the top 3
  bookmarks from the same flat list.
- `src/lib/bookmarks.ts` → `getBookmarks()` queries `ticketMetadata` joined with `ticket` and
  `sprintNameCache`; returns `BookmarkEntry[]` ordered by `bookmarked_at DESC`.
- There is no concept of a bucket, container, or category on bookmarks today.

## Proposed Approach

1. **New DB table** — `bookmark_bucket`: `id`, `name`, `position` (for bucket ordering).
2. **Bucket assignment** — add `bookmark_bucket_id` (nullable) to `ticket_metadata`. Null =
   unassigned / default bucket.
3. **API** — new CRUD routes under `/api/bookmark-buckets/` (create, rename, delete, reorder);
   extend `PUT /api/tickets/[key]/metadata` to accept `bookmarkBucketId`.
4. **`/bookmarks` page** — replace the flat list with a multi-bucket layout (columns or
   collapsible sections — see Open Questions). Use `@dnd-kit` (already in the stack) for
   drag-and-drop between buckets and within a bucket.
5. **Launcher** (`BookmarksView.tsx`) — no change in Phase 1; continue showing the top 3
   most-recently bookmarked regardless of bucket.

Non-goals: syncing buckets to Jira, bucket-level bulk actions, sharing buckets with others,
showing buckets in the sprint board view.

## Open Questions

- **Layout** — should buckets be rendered as horizontal **columns** (kanban-style) or vertical
  **collapsible sections**? Recommended default: collapsible sections (less horizontal scroll,
  consistent with the rest of the app). Decide before implementation starts.
- **Default / uncategorized state** — should a freshly bookmarked ticket land in a special
  "Uncategorized" bucket, or float above all buckets until manually placed? Recommended default:
  "Uncategorized" catch-all bucket that always exists and cannot be deleted.
- **Ticket in multiple buckets** — can a bookmark appear in more than one bucket, or only one?
  Recommended default: one bucket per bookmark (simpler data model, clearer mental model).
- **Bucket deletion** — when a bucket is deleted, should its tickets be moved to "Uncategorized"
  or remain bookmarked without a bucket? Recommended default: move to "Uncategorized".
- **Launcher quick-list with buckets** — should the launcher show bucket name next to each entry
  once buckets exist, or stay as-is? Recommended default: stay as-is for now.

## Acceptance Criteria

- [ ] PO can create a named bucket on the `/bookmarks` page.
  <!-- new POST /api/bookmark-buckets route; bucket_bucket table in src/db/schema.ts -->
- [ ] PO can rename and delete an existing bucket.
  <!-- PATCH / DELETE /api/bookmark-buckets/[id] -->
- [ ] Bookmarks are grouped by bucket on the `/bookmarks` page.
  <!-- src/app/(app)/bookmarks/page.tsx; getBookmarks() extended with bucket join -->
- [ ] PO can drag a bookmark from one bucket to another; the assignment persists after page
  reload.
  <!-- @dnd-kit already in deps; ticket_metadata.bookmark_bucket_id written via PUT /api/tickets/[key]/metadata -->
- [ ] Newly bookmarked tickets land in "Uncategorized" (or the equivalent default) if no bucket
  is chosen.
  <!-- nullable bookmark_bucket_id treated as default bucket in getBookmarks() -->
- [ ] Buckets can be reordered by drag-and-drop.
  <!-- bookmark_bucket.position column; PATCH /api/bookmark-buckets/[id] -->

## Tests

- [ ] Unit: creating a bucket persists name and position in `bookmark_bucket`.
  <!-- new src/lib/bookmark-buckets.test.ts -->
- [ ] Unit: assigning a ticket to a bucket writes `bookmark_bucket_id` to `ticket_metadata`.
  <!-- src/services/ticket-service.test.ts -->
- [ ] Unit: deleting a bucket moves its tickets to the default/uncategorized state.
  <!-- src/lib/bookmark-buckets.test.ts -->
- [ ] Unit: `getBookmarks()` groups results by bucket when buckets exist.
  <!-- src/lib/bookmarks.test.ts -->

## Related

- `src/lib/bookmarks.ts` — `getBookmarks()` to extend with bucket grouping.
- `src/app/(app)/bookmarks/page.tsx` — page to restructure into multi-bucket layout.
- `src/components/nav/BookmarksView.tsx` — launcher quick-list (no change in Phase 1).
- `src/db/schema.ts` — `ticketMetadata` table to extend; new `bookmarkBucket` table.
- `src/app/api/tickets/[key]/metadata/route.ts` — extend PUT to accept `bookmarkBucketId`.
- `docs/architecture/database-schema.md` — schema context.
- [[BRDG-355]] — original bookmark feature this extends.
