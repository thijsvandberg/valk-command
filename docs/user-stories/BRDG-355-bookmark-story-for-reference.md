# BRDG-355: Bookmark a story for easy reference (any sprint)

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As the Product Owner, I want to **bookmark** any story so I can get back to it quickly later, **regardless of which sprint it is in** (or whether it is in a sprint at all, e.g. backlog). A bookmark is a deliberate, persistent flag I set myself — unlike "recently viewed" (BRDG-330), which is automatic and capped at 10.

I want to be able to bookmark from **anywhere I encounter a story**: its single view (`/tickets/[key]`), the editor (`/tickets/[key]/write` + `/story-writer`), a **sprint board row** (including the right-click action menu), and the **Inbox**. I also want an **optional note** on the bookmark explaining *why* I saved it — reusing the existing **PO note** (`poNotes`) so there is one place for my notes about a ticket.

I want to see at a glance **on the board / backlog** whether a story is bookmarked (a small tag on the row), open a **quick list** of my bookmarks from the launcher (next to Recently viewed) on any page, and have a full **`/bookmarks` page** (a regular sprint board) for the complete overview.

The goal is a single curated, cross-sprint list of "stories I care about right now" that I can set from anywhere, see marked on the board, and open straight into.

## Current Behaviour

- There is no way to flag a ticket for later. The only quick-access list is **Recently viewed** (BRDG-330): automatic, localStorage-only, capped at 10, de-duplicated, reachable as a flip-view in the nav panel (`src/components/nav/NavPanel.tsx`, flipping to `RecentlyViewedView`).
- PO notes already exist as `ticketMetadata.poNotes` (Bridge-local, never synced to Jira) and are editable in the ticket side panel / detail (`src/components/ticket-detail/TicketMetaContent.tsx`). They are surfaced on the ticket API as `notes` (`src/app/api/tickets/route.ts`).
- PO metadata is read/written through `ticketService.updateTicketMetadata` + `PUT /api/tickets/[key]/metadata` (`UpdateMetadataInput` at `src/services/ticket-service.ts`).
- Board row edits ride the **pending-edits overlay** (`src/components/sprint-board/pendingTicketEdits.ts`) so they show instantly and never snap back; see `docs/architecture/optimistic-updates.md`. Bulk/row actions across Sprint Board, Epic children and Inbox go through **one** dispatch (`src/components/sprint-board/row-actions/useRowActions.ts`), with a per-surface adapter — this is where the existing `flagged` toggle lives, and the closest template for `bookmarked`.

## Decisions (agreed with PO)

- **Storage:** Bridge-local metadata (DB), not localStorage — so bookmarks survive across browsers/devices (single-user app, confirmed desired).
- **Note:** optional; never required to bookmark. It **reuses the existing PO note** (`poNotes`) — no second note field. Shown in the list as a **hover-reveal** of the note (icon or inline reveal), edited via the existing PO note field.
- **Capacity:** bookmarks are **uncapped** (manual curation, unlike the 10-cap recently-viewed list).
- **Launcher:** the quick-access area shows **two** siblings — **Recently viewed · Bookmarks**. There is **no** three-way split and **no** BRDG-356 "Recently created" entry: "Recently created" is the **Inbox**, which already has its own primary-nav entry.
- **Backlog/board tag:** a bookmark shows as a small badge on the board row (including backlog rows), consistent with the existing row-marker family (Slate + Violet), via `IssueMetaBadges`.
- **`/bookmarks` full page:** a regular sprint board reusing the existing `SprintBoard`, reached via a **"See all"** link at the bottom of the Bookmarks quick-list (not a permanent primary-nav item).
- **Instant + no snap-back:** toggling a bookmark shows immediately and must **not** disappear at ~30s and reappear only after refresh — it rides the pending-edits overlay with revalidate-on-confirm (see Implementation).
- **Perceived speed:** the quick-list must feel instant, not cascade in after opening (see the perf note under Implementation).

## Storage

- Add a single column to `ticketMetadata`: `bookmarkedAt: text("bookmarked_at")` (ISO timestamp; `null` = not bookmarked). A timestamp rather than a boolean gives free "most-recently-bookmarked first" ordering, mirroring `lastScannedAt` / recently-viewed. New Drizzle migration.
- The **note is NOT a new field**: it is the existing `poNotes`. No schema change for the note.

## API

- Extend `UpdateMetadataInput` with `bookmarked?: boolean`; in `updateTicketMetadata`, set `bookmarkedAt = now` when `true`, `null` when `false`. Keep the public input a simple boolean; validate it is a boolean; the timestamp is an implementation detail.
- Expose `bookmarked: boolean` (derived from `bookmarkedAt`) on the ticket payload in `src/app/api/tickets/route.ts` alongside `notes`, so the board row can show the badge + toggle state without an extra fetch. Update the ticket type in `src/types/`.
- New read endpoint **`GET /api/bookmarks`** returning the cross-sprint bookmarked list in ONE payload (key, title, issue type, status, `sprintName`, `poNotes` snippet, `bookmarkedAt`), ordered `bookmarkedAt` desc. Reuses the same ticket/metadata join as the board so a bookmarked backlog ticket (no sprint) still appears. This batch shape is what makes the quick-list paint instantly (no per-row fetch — see Implementation perf note).

## UI

1. **Toggle affordance across surfaces** — a bookmark icon (lucide `Bookmark` / `BookmarkCheck`), optimistic:
   - **Board rows + right-click action menu + Inbox + Epic children:** add `bookmarked` to the shared row-actions dispatch (`row-actions/useRowActions.ts`), mirroring the existing `flagged` toggle, so all these surfaces get the toggle from one implementation with the correct per-surface optimism.
   - **Side panel + ticket detail:** button in `TicketMetaContent.tsx` (sidebar overlay rule — see optimistic-updates.md).
   - **Editor:** the same button on `/tickets/[key]/write` + `/story-writer`.
   - Every state needs hover / focus-visible / active + `cursor: pointer`.
2. **Backlog/board badge** — a `BookmarkBadge` sibling in `IssueMetaBadges.tsx` (next to `EpicBadge`, `SprintBadge`, …), rendered from `ticket.bookmarked`, styled in the existing row-marker family (Slate + Violet), theme-aware. Renders on every board/backlog row, including no-sprint backlog tickets.
3. **Launcher quick-list** — the nav panel shows two siblings: the existing **Recently viewed** row plus a new **Bookmarks** row that flips to a `BookmarksView`. `BookmarksView` reuses the `RecentlyViewedView` layout/anatomy (hairline borders, brand focus ring, hover states, `TicketRefPill`/status pill + title). It is fed by `GET /api/bookmarks` (single fetch), ordered most-recent-first, uncapped. The PO note is revealed **on hover** (icon/tooltip) when present; entries without a note show nothing extra. A **"See all"** footer link navigates to `/bookmarks`.
4. **`/bookmarks` full page** — new route under `src/app/(app)/bookmarks/page.tsx` reusing the existing `SprintBoard` rendering, fed by the bookmarked set (cross-sprint, uncapped, most-recent-first).
5. The note itself is edited where it already is (the existing PO note field). The bookmark list and page only *display* it and link through; no second note editor.

## Implementation Plan

1. **Schema + migration** — add `bookmarkedAt` to `ticketMetadata` (`src/db/schema.ts`); generate Drizzle migration.
2. **Service** — extend `UpdateMetadataInput` with `bookmarked?: boolean`; translate to `bookmarkedAt` set/clear in `updateTicketMetadata` (`src/services/ticket-service.ts`); validate boolean.
3. **Ticket payload** — surface `bookmarked` in `src/app/api/tickets/route.ts` next to `notes`; update the ticket type in `src/types/`.
4. **Read endpoint** — `GET /api/bookmarks` returning the cross-sprint bookmarked list (single batch payload) ordered by `bookmarkedAt` desc, including `notes` snippet and `sprintName`.
5. **Snap-back-proof toggle (the "disappears after 30s" fix)** — treat `bookmarked` as an editable board field per `docs/architecture/optimistic-updates.md`:
   - Add `bookmarked` to `EditableField` in `pendingTicketEdits.ts`.
   - The board adapter `registerPendingEdit` before the write → `confirmPendingEdit` on success / `clearPendingEdit` on failure.
   - If saving via `saveTicketMetadata`, pass `{ patchList: false }` (do not patch the list cache — that defeats self-heal).
   - **On confirm, revalidate the list via the provider-bound mutator** (`adapter.mutate()` — never the top-level `swr` `mutate`) so self-heal clears the overlay before its 30s TTL evicts the value (BRDG-455 lesson). The badge must also update on the board row.
   - Render the `BookmarkBadge` through the overlay-applied list so the toggle reflects instantly on the row.
6. **Row-actions dispatch** — add the `bookmarked` action to `useRowActions.ts` (mirror `flagged`); Board adapter uses the overlay, Inbox/Epic adapters `mutate()`.
7. **UI surfaces** — bookmark button in `TicketMetaContent.tsx` (sidebar rule: overlay for the board list, `patchTicketDetailCache` for the sidebar re-seed) and on the editor pages.
8. **Launcher + `/bookmarks`** — add the Bookmarks row + `BookmarksView` flip (mutually exclusive with the other flips), fed by `GET /api/bookmarks`; add the `/bookmarks` page reusing `SprintBoard`; add the "See all" footer link.
9. **Perf (make the quick-list feel instant)** — two causes on Recently viewed, both addressed:
   - **Cascade:** `revealStyle` delays each row by `60 + i*45ms`, so long lists keep popping in for ~half a second. Cap the max stagger delay so neither list cascades (benefits Recently viewed too).
   - **Per-row fetch:** Recently viewed fetches each row's detail separately. Bookmarks avoids this by rendering from the single `GET /api/bookmarks` payload, so rows paint fully-formed on first render.
10. **Cache/invalidations** — the metadata PUT already invalidates the ticket's keys; also invalidate `/api/bookmarks` (via a provider-bound / `scopedMutate` mutator, never top-level `swr` `mutate`) so the list refreshes after a toggle.
11. **Frontend polish** — run the `frontend-design` skill before writing UI: icon states, badge treatment, hover-reveal, spacing/depth per the Anti-Generic guardrails; no default Tailwind blue/indigo, no `transition-all`.
12. **Tests** — see below.

### Plan refinements (from the planning pass)

- **Write-path divergence (important):** `flagged` is a Jira-synced field written through `PATCH /api/tickets/[key]` (`tickets.toggleFlag`); `bookmarked` is Bridge-local metadata and MUST be written through `PUT /api/tickets/[key]/metadata` (`tickets.updateMetadata({ bookmarked })`). Mirror `flagged`'s **overlay/dispatch mechanics only**, not its write path.
- **`/bookmarks` page data source:** `SprintBoard` takes no props and derives data from the URL slug. Add a narrow optional prop (e.g. `bookmarkedOnly`) that filters the All-view list (`t.bookmarked`) rather than building a second board. The lightweight `GET /api/bookmarks` payload serves the launcher quick-list; the page reuses the board's own `/api/tickets` All-view data.
- **Overlay confirm must revalidate (BRDG-455):** the board dispatch's `confirmEdit` bookmarked branch calls the provider-bound `base.mutate()` so the overlay self-heals before its 30s TTL (metadata write invalidates the `/api/tickets` cache, so the refetch is fresh). Never the top-level `swr` `mutate`.
- **Working-tree hygiene (this run):** an active parallel session (BRDG-473/474) has heavy uncommitted edits, including `BoardRow.tsx`. To avoid committing their WIP: `BookmarkBadge` lives in a NEW file `src/components/shared/BookmarkBadge.tsx` (not the dirty `IssueMetaBadges.tsx`); the badge render in `BoardRow.tsx` is made in the working tree but left UNCOMMITTED and reported, since that file cannot be staged without entangling parallel work. All other files commit cleanly with explicit paths.

## Acceptance Criteria

- [ ] I can bookmark and un-bookmark any ticket from its side panel, detail, editor, a board row, the row's right-click action menu, and the Inbox; the icon reflects state immediately (optimistic) and persists across reloads.
- [ ] Toggling a bookmark shows instantly and does **not** disappear after ~30s / require a refresh to reappear (rides the pending-edits overlay + revalidate-on-confirm).
- [ ] A ticket can be bookmarked regardless of its sprint, including a backlog ticket with no sprint.
- [ ] Board/backlog rows show a bookmark badge when the ticket is bookmarked, styled in the existing row-marker family; the badge appears/disappears with the toggle without a refresh.
- [ ] The launcher shows two quick-access siblings — Recently viewed · Bookmarks — on every page; opening Bookmarks does not navigate me away.
- [ ] The Bookmarks quick-list opens instantly (no cascade, no per-row loading), shows the ticket pill + title, reveals the PO note on hover when present, is uncapped, and one click opens the ticket.
- [ ] A "See all" link opens the full `/bookmarks` page — a regular sprint board of all bookmarked tickets, cross-sprint, most-recent-first.
- [ ] Bookmarking never requires a note (note is optional). The note is the existing PO note (`poNotes`); editing it updates what the list/page reveal; no separate note field is introduced.
- [ ] Bookmarks persist in the Bridge database (survive browser/device change), not just localStorage.

## Tests

- [ ] Service test: `updateTicketMetadata({ bookmarked: true })` sets `bookmarkedAt`; `{ bookmarked: false }` clears it to `null`; non-boolean is rejected.
- [ ] `GET /api/bookmarks` returns only bookmarked tickets, most-recent-first, in one payload, and includes a backlog (no-sprint) bookmark.
- [ ] Overlay test: a `bookmarked` toggle survives a stale refetch (value does not snap back / disappear at TTL) — mirror `pendingTicketEdits.test.ts` / `useTicketActions.test.ts`.
- [ ] Metadata PUT route invalidates the bookmarks cache so the list reflects a toggle without manual refresh.
- [ ] Component test: bookmark toggle renders the correct icon state and fires the optimistic update; `BookmarkBadge` renders on a bookmarked row; `BookmarksView` renders entries with pill + title, reveals the note on hover only when a note exists; the "See all" link targets `/bookmarks`.

## Related

- [[BRDG-330-recently-viewed-tickets]] — same nav-panel flip-view pattern; bookmarks are the manual, persistent counterpart. The Bookmarks list reuses this view and shares the reveal-stagger perf fix.
- [[BRDG-356-newly-created-stories-inbox]] — "Recently created" is the Inbox, which already has its own nav entry; **not** a launcher sibling here (supersedes the earlier three-way-split plan).
- [[BRDG-276-default-editable-ticket-hover-card]] — candidate surface for the bookmark toggle.
- [[BRDG-168-pin-conversations-discoverability]] — prior "pin for quick access" UX, for conversations.
