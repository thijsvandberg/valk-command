# BRDG-355: Bookmark a story for easy reference (any sprint)

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As the Product Owner, I want to **bookmark** any story so I can get back to it quickly later, **regardless of which sprint it is in** (or whether it is in a sprint at all, e.g. backlog). A bookmark is a deliberate, persistent flag I set myself — unlike "recently viewed" (BRDG-330), which is automatic and capped at 10.

I also want an **optional note** on the bookmark explaining *why* I saved it. Rather than introduce a separate note field, the bookmark should reuse the existing **PO note** (`poNotes`) on the ticket, so there is one place for my notes about a ticket and the bookmark list can show a snippet of it.

The goal is a single curated, cross-sprint list of "stories I care about right now" that I can open from anywhere and click straight into.

## Current Behaviour

- There is no way to flag a ticket for later. The only quick-access list is **Recently viewed** (BRDG-330): automatic, localStorage-only, capped at 10, de-duplicated, reachable as a flip-view in the nav panel (`src/components/nav/NavPanel.tsx`).
- PO notes already exist as `ticketMetadata.poNotes` (Bridge-local, never synced to Jira) and are editable in the ticket side panel / detail (`src/components/ticket-detail/TicketMetaContent.tsx`). They are surfaced on the ticket API as `notes` (`src/app/api/tickets/route.ts:148`).
- PO metadata is read/written through `ticketService.updateTicketMetadata` + `PUT /api/tickets/[key]/metadata` (`UpdateMetadataInput` at `src/services/ticket-service.ts:486`).

## Proposed Approach

Bookmarks are durable, manually-curated PO state about a ticket, so they belong in the Bridge-local metadata layer (not localStorage like recently-viewed) — this also makes the list survive across devices/browsers.

### Storage
- Add a single column to `ticketMetadata`: `bookmarkedAt: text("bookmarked_at")` (ISO timestamp; `null` = not bookmarked). A timestamp rather than a boolean gives free "most-recently-bookmarked first" ordering for the list, mirroring how `lastScannedAt` / recently-viewed work. New Drizzle migration.
- The **note is NOT a new field**: it is the existing `poNotes`. The bookmark just references it. No schema change for the note.

### API
- Extend `UpdateMetadataInput` with `bookmarked?: boolean` and have `updateTicketMetadata` set `bookmarkedAt = datetime('now')` when `true`, `null` when `false`. (Keep the public input a simple boolean; the timestamp is an implementation detail.)
- Expose `bookmarkedAt` (or a derived `bookmarked: boolean`) on the ticket payload in `src/app/api/tickets/route.ts` alongside `notes`, so the board/side panel can show the toggle state and the list can render note snippets without an extra fetch.
- New read endpoint `GET /api/bookmarks` returning bookmarked tickets (key, title, sprint name, `poNotes` snippet, `bookmarkedAt`), ordered most-recent-first. Reuses the same ticket/metadata join as the board so a bookmarked backlog ticket (no sprint) still appears.

### UI
1. **Toggle affordance** — a bookmark icon (lucide `Bookmark` / `BookmarkCheck`) on the ticket where PO metadata already lives: the Sprint Board side panel and the ticket detail (`TicketMetaContent.tsx`), and ideally the ticket hover card (BRDG-276). Optimistic toggle, consistent with other instant-UI mutations (BRDG-334). Every state needs hover / focus-visible / active + `cursor: pointer`.
2. **Nav-panel quick-access row, split three ways** — today the nav panel has a single "Recently viewed" row (`src/components/nav/NavPanel.tsx:278-293`, flipping to `RecentlyViewedView`). Replace it with one row split into **three** sibling entries: **Recently viewed · Recently created · Bookmarks**. Each flips to its own list (same flip-view mechanics, overlay, stagger and dismiss as the current recently-viewed flip). Each entry uses `TicketRefPill` + title; one click opens the ticket.
   - The split row keeps the existing visual anatomy (hairline border, brand focus ring, hover states). The three entries can be a segmented control or three compact rows under one section — pick whichever reads cleanest at the panel's width (the panel widens to `640px` when a flip is open).
3. **Note shown as a hover-reveal icon** — the bookmark list does **not** render the note inline as a text snippet. Instead, an entry that has a `poNotes` note shows a small **note icon** (e.g. lucide `StickyNote`); hovering it reveals the note (tooltip / small popover). Entries without a note show no icon. The note is **optional** — bookmarking never requires one.
4. The note itself is edited where it already is (the existing PO note field). The bookmark list only *displays* it on hover and links through; no second note editor.

### "Recently created" (sibling in the same row — separate story)
"Recently created" is the third entry in the split row, but it is owned by its own story: [[BRDG-356-newly-created-stories-inbox]]. BRDG-355 only needs to lay out the row so all three entries fit; the Recently-created list/data source is built there. Coordinate the shared nav-panel row layout between the two stories.

## Open Questions

- **Cross-device:** storing bookmarks in `ticketMetadata` (DB) makes them shared across browsers/devices, unlike recently-viewed (localStorage). Assumption: desired (single-user app). Confirm.

## Decided

- **Surface:** the nav-panel quick-access row is split three ways — Recently viewed · Recently created · Bookmarks — each a flip-view list.
- **Note:** optional; never required to bookmark. Shown in the list as a hover-reveal **icon**, not an inline snippet. Edited via the existing PO note field.
- **Capacity:** bookmarks are **uncapped** (manual curation, unlike the 10-cap recently-viewed list).

## Implementation Plan

1. **Schema + migration** — add `bookmarkedAt` to `ticketMetadata` (`src/db/schema.ts`); generate Drizzle migration.
2. **Service** — extend `UpdateMetadataInput` with `bookmarked?: boolean`; in `updateTicketMetadata`, translate to `bookmarkedAt` set/clear (`src/services/ticket-service.ts`). Validate it is a boolean.
3. **Ticket payload** — surface `bookmarked`/`bookmarkedAt` in `src/app/api/tickets/route.ts` next to `notes`; update the ticket type in `src/types/`.
4. **Read endpoint** — `GET /api/bookmarks` (new route) returning the cross-sprint bookmarked list ordered by `bookmarkedAt` desc, including `notes` snippet and `sprintName`.
5. **Toggle UI** — bookmark button in `TicketMetaContent.tsx` (side panel + detail), optimistic, calling the existing metadata PUT with `{ bookmarked }`. Consider the hover card.
6. **Split row + Bookmarks list** — in `NavPanel.tsx`, replace the single "Recently viewed" row (`:278-293`) with a three-way split row (Recently viewed · Recently created · Bookmarks). Add a `BookmarksView` flip-view (mirror `RecentlyViewedView`), with its own open state mutually exclusive with the account/recent/created flips. Entries use `TicketRefPill` + title and a hover-reveal note icon when `poNotes` is present.
7. **Cache/invalidations** — the metadata PUT already invalidates the ticket's keys; also invalidate `/api/bookmarks` so the list refreshes after a toggle.
8. **Tests** — see below.

## Acceptance Criteria

- [ ] I can bookmark and un-bookmark any ticket from its side panel / detail; the icon reflects state immediately (optimistic) and persists across reloads.
- [ ] A ticket can be bookmarked regardless of its sprint, including a backlog ticket with no sprint.
- [ ] The nav-panel quick-access row is split three ways — Recently viewed · Recently created · Bookmarks — each opening its own list; available on every page and opening a list does not navigate me away.
- [ ] I can open a single cross-sprint list of all my bookmarks from that row; one click on an entry opens the ticket.
- [ ] Each bookmark entry shows the ticket pill + title; when a PO note exists it shows a note icon, and hovering the icon reveals the note. Entries without a note show no icon.
- [ ] Bookmarking never requires a note (note is optional). The note is the existing PO note (`poNotes`) — editing it updates what the list reveals; no separate note field is introduced.
- [ ] The bookmark list is uncapped.
- [ ] Bookmarks persist in the Bridge database (survive browser/device change), not just localStorage.

## Tests

- [ ] Service test: `updateTicketMetadata({ bookmarked: true })` sets `bookmarkedAt`; `{ bookmarked: false }` clears it to `null`; non-boolean is rejected.
- [ ] `GET /api/bookmarks` returns only bookmarked tickets, most-recent-first, and includes a backlog (no-sprint) bookmark.
- [ ] Metadata PUT route invalidates the bookmarks cache so the list reflects a toggle without manual refresh.
- [ ] Component test: bookmark toggle renders correct icon state and fires the optimistic update; nav-panel bookmarks flip-view renders entries with pill + title, shows the note icon only when a note exists, and reveals the note on hover.

## Related

- [[BRDG-356-newly-created-stories-inbox]] — "Recently created", the third entry in the same split nav-panel row; shares the row layout.
- [[BRDG-330-recently-viewed-tickets]] — same nav-panel flip-view pattern; bookmarks are the manual, persistent counterpart.
- [[BRDG-168-pin-conversations-discoverability]] — prior "pin for quick access" UX, for conversations.
- [[BRDG-276-default-editable-ticket-hover-card]] — candidate surface for the bookmark toggle.
