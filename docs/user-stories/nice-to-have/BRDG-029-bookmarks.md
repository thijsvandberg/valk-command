# BRDG-029: Bookmarks

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to bookmark any page or view in valk-command so I can quickly jump back to frequently used locations without navigating through the sidebar each time.

## Core Concepts

- **Bookmark button**: A fixed-position button on every page (e.g. top-right area near the page header) that lets me bookmark the current URL
- **Bookmark = URL + label**: Each bookmark stores the full path and a display label (auto-derived from the page title, editable)
- **Sidebar section**: A "Bookmarks" menu item in the sidebar that expands to show all saved bookmarks
- **Database persistence**: Bookmarks are stored in SQLite via Drizzle ORM, accessed through a REST API

## Acceptance Criteria

### Phase 1: Bookmark infrastructure
- [ ] Drizzle schema: `bookmark` table with columns `id` (text PK), `path` (text, unique), `label` (text), `sortOrder` (integer), `createdAt` (text, default now)
- [ ] Drizzle migration for the new table
- [ ] API route `src/app/api/bookmarks/route.ts` with GET (list all, ordered by sortOrder) and POST (create)
- [ ] API route `src/app/api/bookmarks/[id]/route.ts` with PATCH (rename, reorder) and DELETE
- [ ] `useBookmarks` hook that wraps the API with SWR/fetch and exposes CRUD methods
- [ ] Auto-derive a sensible default label from the current route (e.g. "/sprint-board" becomes "Sprint Board", "/tickets/VALK-42" becomes "VALK-42")

### Phase 2: Bookmark button on pages
- [ ] A bookmark toggle button in a consistent, fixed position on every page (e.g. top-right of the content area)
- [ ] Filled/active state when the current page is already bookmarked
- [ ] Clicking when not bookmarked: adds the bookmark with the auto-derived label
- [ ] Clicking when already bookmarked: removes the bookmark
- [ ] Subtle animation on toggle (scale + opacity, not transition-all)

### Phase 3: Sidebar integration
- [ ] "Bookmarks" item in the sidebar navigation (with Lucide `Bookmark` icon)
- [ ] Clicking "Bookmarks" expands an inline list of all bookmarks below the menu item
- [ ] Each bookmark is a clickable link that navigates to the saved path
- [ ] When sidebar is collapsed: "Bookmarks" icon shows, hover/click opens a floating popover with the bookmark list
- [ ] Visual indicator (dot or count badge) on the Bookmarks icon when bookmarks exist

### Phase 4: Bookmark management
- [ ] Rename a bookmark via inline edit (click the label to edit)
- [ ] Remove a bookmark via a small delete button (hover-reveal)
- [ ] Drag-and-drop reorder of bookmarks in the sidebar list
- [ ] Maximum bookmark count: 20 (show a message when limit is reached)

## Technical Notes

- Persistence: SQLite `bookmark` table via Drizzle ORM, same pattern as other tables in `src/db/schema.ts`
- API: REST routes under `src/app/api/bookmarks/`, follows the existing API pattern in the project
- The `useBookmarks` hook fetches via the API and mutates optimistically for snappy UX
- The bookmark button component should be placed in the shared layout so it appears on all pages automatically
- Dynamic routes (e.g. `/tickets/[key]`) should store the resolved path (e.g. `/tickets/VALK-42`), not the template
- `path` column has a unique constraint so the same page cannot be bookmarked twice

## Out of Scope (for now)
- Bookmark folders or categories
- Bookmark import/export
- Keyboard shortcut to bookmark (can be added later)
- Bookmark search/filter (list is small enough to scan)
