# BRDG-330: Recently viewed tickets — quick access from any page

**Status:** Draft
**Priority:** Medium

> **Draft note:** Two product decisions are still open (see _Open decisions_ below): **where** the list surfaces and **whether** it syncs across devices. The acceptance criteria are written against the recommended defaults (header popover + local-per-browser storage). Revisit before promoting to "To Do".

## Description

As the PO, I jump between tickets across many views (Sprint Board, ticket/epic detail, Refinement, Story Writer). When I want to get back to a ticket I just looked at, I currently have to search for it again or retrace my steps.

I want to see my **last 10 viewed tickets** from roughly **every page**, so I can re-open one in a single click — quick access without searching.

A "view" is any moment a ticket becomes the focused/open item: opening it in the Sprint Board side panel, landing on its detail page, opening it in a Refinement session, or previewing a child/linked ticket in the side panel. The list is most-recent-first, de-duplicated (re-viewing a ticket moves it to the top, not a second entry), and capped at 10.

## Open decisions

These are not yet decided. The story is written against option **(a)** in each case; change before implementation if desired.

1. **Where does the list surface?**
   - **(a) Recommended — header popover.** A small "Recent" control in the existing header command bar (BRDG-320). One click opens a dropdown with the last 10. Always visible, fastest path. The header is rendered on every `(app)` page, so it satisfies "from any page" cleanly.
   - (b) Command-palette section. A "Recently viewed" block at the top of Cmd+K. No extra chrome, but requires a shortcut/extra step.
   - (c) Both surfaces, sharing one data source.

2. **Does the list travel across devices/browsers?**
   - **(a) Recommended — local per browser** (`localStorage`, existing `useLocalStorage` hook). Simple, instant, no backend. List is per browser/device. Fine for a single-user app on one main machine.
   - (b) Synced via a DB table + API, so the list is identical on every device. More work; only worth it if you regularly switch devices.

## Acceptance Criteria

_(Written for header popover + local storage; adjust if the open decisions change.)_

- [ ] A "Recent" control is reachable from every `(app)` page (placed in the header command bar).
- [ ] Opening it shows the **last 10 viewed tickets**, most-recent-first, each showing at least the ticket key and title.
- [ ] Clicking an entry navigates to that ticket (`/tickets/{key}`).
- [ ] A ticket is recorded as "viewed" when it becomes the focused/open item in:
  - [ ] Sprint Board side panel selection (`selectTicket`)
  - [ ] Ticket / epic detail page (`/tickets/[key]`)
  - [ ] Refinement session ticket view
  - [ ] Side-panel preview of a child / linked ticket (`onSelectTicket`)
- [ ] Re-viewing a ticket moves it to the top rather than creating a duplicate entry.
- [ ] The list never exceeds 10 entries; the 11th view evicts the oldest.
- [ ] The list persists across page reloads and browser restarts (localStorage).
- [ ] Empty state is handled gracefully (e.g. "No recently viewed tickets yet") with no error.
- [ ] A stale/invalid key in the list fails gracefully (entry is skipped or removed, no crash).
- [ ] Tests cover: recording a view prepends + de-dupes, the cap evicts the oldest, and the popover renders + navigates correctly.

## Technical Notes

- **Storage:** reuse `useLocalStorage` (`src/hooks/useLocalStorage.ts`) with a key like `bridge:recently-viewed`, value `Array<{ key: string; title?: string; viewedAt: number }>`. The hook already syncs across tabs via the `storage` event and handles quota errors — re-use, don't reinvent.
- **Recording:** add a small `useRecordTicketView()` hook (or a `recordTicketView(key, title)` helper backed by the same storage key) and call it from the view points below. Keep it side-effect-only so it can be dropped into existing callbacks without restructuring:
  - `selectTicket(key)` in `src/components/sprint-board/SprintBoard.tsx` (~line 211)
  - mount of `src/app/(app)/tickets/[key]/page.tsx` (the resolved `routeKey`)
  - the Refinement session ticket view (`src/components/refinement-session/SessionTicketView.tsx`)
  - the side-panel `onSelectTicket` callback in `src/app/(app)/tickets/[key]/page.tsx`
- **Watch React Compiler lint rules** (no setState-in-effect) when recording on page mount — prefer recording in the existing data-load/selection callback over a bare `useEffect` that sets state.
- **Display surface (option a):** add the "Recent" control to the header command bar (BRDG-320). If option (b) is chosen instead, add a "recently-viewed" category in `src/components/command-palette/useCommandPalette.ts` and render it as a top section — the grouped-results logic already supports section headers.
- **Navigation:** link entries to the canonical `/tickets/{key}` route, which works from anywhere. (Sprint-board deep-link via `buildBoardUrl` is an option only if we later want to restore sprint context; not needed for v1.)
- Capture title at record time so the popover can render without an extra fetch; fall back to showing just the key if the title is unknown.

## Out of Scope

- Cross-device sync (only relevant if open decision #2 picks option b).
- Recording Story Writer session opens as "ticket views" (sessions aren't always a Jira ticket); can be added later if useful.
- Pinning / favouriting tickets, or any manual curation of the list — this is purely automatic MRU.
- Showing rich metadata (status, assignee, scores) in the list beyond key + title.
- Server-side analytics on what gets viewed.
