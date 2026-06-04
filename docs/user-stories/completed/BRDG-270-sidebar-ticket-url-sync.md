# BRDG-270: Sync the Sprint Board side panel with the URL

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, when I open a ticket in the Sprint Board side panel I want the URL to reflect
the open ticket, so I can refresh, deep-link, share, and use the browser back/forward
buttons. Today the side panel is purely client state: the open ticket is not in the URL,
so a refresh loses the panel and there is no shareable link to a ticket-in-context.

This is about the **side panel** on the Sprint Board (`/sprint-board`), not the full
ticket page (`/tickets/[key]`), which already has its own route.

## Implementation Plan

**Scope decision (PO):** full path-based routing — board URL becomes `/sprint-board/<sprint-slug>/<ticket>`.

### URL scheme
- `/sprint-board` — no sprint resolved yet (default behaviour).
- `/sprint-board/<sprint-slug>` — sprint selected, panel closed.
- `/sprint-board/<sprint-slug>/<ticket>` — panel open on `<ticket>`.
- `/sprint-board/all` and `/sprint-board/backlog` — reserved slugs for the All view (`__all__`) and backlog (`__backlog__`).
- `?view=<uuid>` (saved views) and filters STAY query params. A saved view renders the sprint slug as `all`.
- Route becomes an optional catch-all: `src/app/(app)/sprint-board/[[...slug]]/page.tsx` (precedent: `login/[[...rest]]`).

### Slug <-> id mapping (`src/lib/sprint-utils.ts`)
- Reserved: `all` <-> `__all__`, `backlog` <-> `__backlog__` (checked first, both directions).
- `slugifySprint(name)`: lowercase, non-alphanumeric -> single hyphens, trim. `"BT: 134"` -> `bt-134`.
- `sprintToSlug` / `slugToSprintId(slug, sprints)`: collision-safe (append numeric id when two sprints slugify the same); returns `null` for unknown slug.
- Unknown slug -> fall back to the existing default sprint resolution (active sprint / first slot), no hard error.

### Shallow updates (no remount / scroll loss)
- `selectedTicket` stays React state; seed it from the path once on mount.
- Ticket open/close writes the URL with `window.history.pushState` (push = back/forward history entries, req #5) — no Next navigation, list + scroll preserved.
- A `popstate` listener re-syncs `selectedTicket` from the URL for back/forward.
- Sprint switching keeps `router.replace(path, { scroll: false })` (same `[[...slug]]` route, re-renders without remount).
- All URL writes go through a `buildBoardUrl(sprintSlug, ticketKey | null, searchParams)` helper that threads existing query params (`view`, etc.) through unchanged.

### Per-checkbox mapping
1. Open writes URL — effect on `selectedTicket` -> `history.pushState` (guarded against the mount seed). All existing `onSelectTicket={setSelectedTicket}` call sites unchanged.
2. Restore on load — parse `useParams().slug`, seed `selectedTicket`, derive sprint id from slug into existing `activeSprintId` logic.
3. Row active state — `TicketTable` already highlights the `selectedTicket` row once it is seeded.
4. Close clears URL — `setSelectedTicket(null)` flows through the same effect, dropping the ticket segment.
5. Back/forward — `pushState` + `popstate` listener.
6. Path-based route — move page into `[[...slug]]/`.
7. Slug<->id map — new helpers in `sprint-utils.ts`.
8. Deep-link fallback — when `selectedTicket` is set but not in `tickets`, fetch via `useTicketDetail(selectedTicket)` and feed the result to `SidePanel`.
9. Tests — slug helpers (unit) + page-level write/restore/clear/active-row.

### Risks / mitigations
- Saved views & All view stay query-driven; route every URL write through `buildBoardUrl` so `view` is preserved.
- Async sprint load: resolve slug in a `useMemo`/effect keyed on `sprints`; seed the ticket independently of `sprints`.
- Guard the open/close effect against the initial mount (ref) so the URL seed does not double-push.
- Update the `next/navigation` mock in `page.test.tsx` (add `usePathname`/`useParams`, `push`, stub `pushState`) or the suite breaks.

## Requirements

### 1. Opening a ticket updates the URL
- Selecting a ticket row (which opens the side panel) puts the ticket key in the URL.
- This should not trigger a full navigation/remount of the board (use a shallow URL
  update so the board list and scroll position are preserved).

### 2. Refresh restores the panel and the row state
- On load, if the URL contains a ticket key, the side panel auto-opens on that ticket.
- The matching row in the table gets its correct **active/selected** state (the same
  highlight as when clicked manually).
- If the ticket is not in the currently loaded view, decide the fallback (e.g. still open
  the panel by fetching the ticket, or switch to the view/sprint that contains it).

### 3. Closing clears the URL
- Pressing **close** on the panel removes the ticket key from the URL (back to the plain
  board URL), and clears the row's active state.
- Browser **back** after opening a ticket should also close the panel (and forward
  re-open it), i.e. the open/close maps onto history entries sensibly.

### 4. Prefer path-based routing over query params
- Ideally the board URL becomes path-based: `/BT-139/VPL-1234` (sprint + ticket) instead
  of the current `?sprint=12321&...` query style.
- The sprint segment should be the human-readable sprint name/key (e.g. `BT-139`), not the
  numeric Jira sprint id.
- Opening a ticket appends the ticket key as a path segment; closing drops it back to the
  sprint segment (`/BT-139`).

## Out of scope
- The full ticket page (`/tickets/[key]`) routing — unchanged.
- Changing what the side panel renders (tabs, meta, etc.) — covered by BRDG-260.

## Technical notes / open questions
- Board state currently lives in query params (e.g. `?sprint=<id>`, saved `?view=<uuid>`).
  Moving to `/BT-139/VPL-1234` is a routing change that touches how the board reads its
  current sprint/view and how filters/saved views are encoded — scope this carefully; it
  may be worth splitting the path-based-routing part (#4) from the simpler URL-sync part
  (#1-#3) if it grows.
- Need a reliable mapping between the human sprint key (`BT-139`) and the numeric Jira
  sprint id used today, in both directions.
- Selected-ticket state lives in the Sprint Board page/store; the panel open/close is
  driven from there. The URL becomes the source of truth: row click -> push URL -> panel
  + active row derive from the URL.
- Use Next.js App Router patterns (route segments or `router.replace`/`push` with
  shallow updates) so the board does not hard-reload on open/close.
- Decide `push` vs `replace`: `push` gives back/forward open-close behaviour (req #3);
  `replace` would not create history entries. Requirement #3 implies `push`.
- Deep-link to a ticket not in the active sprint/view: define the fallback behaviour.

## Checklist
- [x] Opening a ticket in the side panel writes the ticket key to the URL (shallow, no remount)
- [x] On load, a ticket key in the URL auto-opens the side panel on that ticket
- [x] The matching table row shows the correct active/selected state on load
- [x] Closing the panel removes the ticket key from the URL and clears the active row
- [x] Browser back/forward maps onto panel open/close sensibly
- [x] Move the board URL to path-based routing `/sprint-board/<sprint-slug>/<ticket>` (sprint key + ticket)
- [x] Map human sprint key <-> numeric Jira sprint id in both directions
- [x] Define and implement the fallback for deep-links to tickets outside the active view
- [x] Tests for URL write on open, restore on load, clear on close, and the row active state

## Implementation notes
- Final URL shape is `/sprint-board/<sprint-slug>/<ticket>` (under the `/sprint-board` segment), not a bare `/BT-139/...` at the app root, so it cannot collide with other routes.
- Saved views (`?view=<uuid>`) and the All view stay query/`all`-slug driven; they are not human-readable, so promoting them to slugs added risk without benefit.
- Legacy `/sprint-board?sprint=<id>` deep links (ticket page, activity log, search, workspace-tasks) still resolve via a back-compat read; the first interaction rewrites the URL to the clean path form.
