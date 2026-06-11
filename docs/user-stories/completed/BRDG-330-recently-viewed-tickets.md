# BRDG-330: Recently viewed tickets — quick access from the nav panel

**Status:** Done
**Priority:** Medium

## Description

As the PO, I jump between tickets across many views (Sprint Board, ticket/epic detail, Refinement). When I want to get back to a ticket I just looked at, I currently have to search for it again or retrace my steps.

I want to see my **last 10 viewed tickets** for quick access, reachable from **the nav panel** (the `bridge_` dropdown in the header, which is available on every page). Opening the list is a **popout** that keeps me on my current page — viewing the list never navigates me away. From the list, one click on a ticket opens it.

A "view" is any moment a ticket becomes the focused/open item: opening it in the Sprint Board side panel, landing on its detail page, opening it in a Refinement session, or previewing a child/linked ticket in the side panel. The list is most-recent-first, de-duplicated (re-viewing a ticket moves it to the top, not a second entry), and capped at 10.

## Decided

- **Surface:** inside the existing nav panel (`src/components/nav/NavPanel.tsx`), the dropdown that opens from the `bridge_` button. The screenshot shows this panel with its Sprint Board hero / Chat / Story Writer / Refinement rows and the account flip.
- **Interaction:** the recently-viewed list is a **popout that stays on the current page** — opening it does not navigate. Preferred implementation is a **flip-view within the nav panel**, mirroring the existing account flip (`AccountView`), so it reuses the panel's overlay, animation and dismiss behaviour. Entry point: a small "Recent" affordance in the panel (e.g. a row or header control alongside the account header).
- **Per-entry content:** each of the 10 entries shows at minimum the **ticket pill + title**. Reuse `TicketRefPill` (`src/components/shared/TicketRefPill.tsx`) for the pill so it matches the rest of the app.
- **Storage:** local per browser via `localStorage` (existing `useLocalStorage` hook). No backend, no cross-device sync.
- **Quality bar:** must look polished and feel intuitive — consistent with the nav panel's existing styling (staggered reveal, hairline rows, brand tokens, hover/focus-visible states). Follows the project's frontend guardrails (no default Tailwind palette, transform/opacity-only animation, every clickable element has hover + focus-visible + active + `cursor: pointer`).

## Implementation Plan

### Architecture: module store + custom event, read hook for the panel

- **`src/lib/recently-viewed-store.ts`** (new): `RECENTLY_VIEWED_KEY = "bridge:recently-viewed"`, `MAX_ENTRIES = 10`, entry type `{ key, title?, viewedAt }`. `readRecentlyViewed()` is SSR-safe, try/catch parse, filters malformed entries. `recordTicketView(key, title?)` de-dupes by key, prepends, slices to 10, writes, and dispatches a custom `valk:recentlyViewed` window event. A plain module function (not a hook) because all call sites are non-render contexts; an effect that only writes localStorage is React-Compiler-safe.
- **`src/hooks/useRecentlyViewed.ts`** (new): seeds from `readRecentlyViewed()` on mount, re-reads on both `storage` (cross-tab) and `valk:recentlyViewed` (same-tab). NavPanel is mounted only while open, so it also gets a fresh read every open.

### Recording call sites (dirty-tree aware)

The tree carries uncommitted BRDG-329/334 work in `src/app/(app)/tickets/[key]/page.tsx` and several ticket-detail files. BRDG-330 commits must not drag that along, so recording routes through clean files:

1. **Sprint Board selection + side-panel child/linked preview** — one effect in `src/components/sprint-board/SidePanel.tsx` (clean): `SidePanel` is rendered both by SprintBoard (board selection) and by the ticket detail page (child/linked preview), always with `ticket.key` + `ticket.title` in props. One mount/key-change effect covers both ACs.
2. **Refinement session** — effect in `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` (clean), where the resolved key + ticket data are in scope.
3. **Ticket detail page load** — `page.tsx` is dirty with BRDG-329, but `src/components/ticket-detail/TicketSidebar.tsx` is clean and rendered exclusively by the detail page (`page.tsx:731`) with the resolved `ticket`. Recording lives there; no page.tsx edit needed.

### NavPanel UI

- Third flip-view alongside `NavigationView`/`AccountView`, toggled by panel-local `recentOpen` state mirroring `accountOpen` (mutually exclusive). Reuses the panel overlay, `revealStyle` stagger, hairline rows, dismiss behavior.
- Entry affordance: compact "Recently viewed" control near the account header with a `History` lucide icon; back affordance flips back.
- Row anatomy: ticket pill + truncated title, most-recent-first. **HTML-nesting caveat:** `TicketRefPill` renders an inner `<a>`, so the row must not be a `<Link>`/anchor — render the row as `role="button"` navigating via `router.push("/tickets/{key}")` + `onClose()`, with the pill inside.
- Empty state: muted "No recently viewed tickets yet".

### Commit order (explicit paths only, never `git add -A`)

1. `feat(recently-viewed): add localStorage store and read hook` — store + hook + their tests.
2. `feat(nav): add recently-viewed flip-view to NavPanel` — NavPanel + its test.
3. `feat(recently-viewed): record views from side panel, detail page and refinement session` — SidePanel + TicketSidebar + refinement session page + tests.

### Test plan

- Store unit tests: prepend, de-dupe moves to top, cap evicts oldest, title carry-forward, malformed JSON/entries skipped without throw, custom event dispatched.
- Hook test: re-reads on custom event and storage event.
- NavPanel tests: Recent affordance present, flip-view opens without navigation, entries render pill + title in order, empty state, click navigates to `/tickets/{key}` and closes panel.
- SidePanel test: mount records key + title; key change records the new ticket.

## Acceptance Criteria

- [x] The nav panel (the `bridge_` dropdown) exposes a "Recent" affordance, reachable from every `(app)` page.
- [x] Activating it shows the **last 10 viewed tickets** as a popout/flip-view **without leaving the current page** (no route navigation to open the list).
- [x] Each entry shows the **ticket pill (`TicketRefPill`) + title**, most-recent-first.
- [x] Clicking an entry navigates to that ticket (`/tickets/{key}`) and closes the panel.
- [x] A ticket is recorded as "viewed" when it becomes the focused/open item in:
  - [x] Sprint Board side panel selection (`selectTicket`)
  - [x] Ticket / epic detail page (`/tickets/[key]`)
  - [x] Refinement session ticket view
  - [x] Side-panel preview of a child / linked ticket (`onSelectTicket`)
- [x] Re-viewing a ticket moves it to the top rather than creating a duplicate entry.
- [x] The list never exceeds 10 entries; the 11th view evicts the oldest.
- [x] The list persists across page reloads and browser restarts (localStorage), and stays in sync if multiple tabs are open (the `useLocalStorage` `storage` event already covers this).
- [x] Empty state is handled gracefully (e.g. "No recently viewed tickets yet") with no error.
- [x] A stale/invalid key in the list fails gracefully (entry skipped or removed, no crash).
- [x] Visual + interaction quality matches the nav panel: staggered reveal animation, hover/focus-visible/active states, `cursor: pointer`, brand tokens, no `transition-all`, no default Tailwind blue/indigo.
- [x] Tests cover: recording a view prepends + de-dupes, the cap evicts the oldest, the popout renders entries with pill + title, and clicking an entry navigates correctly.

## Technical Notes

- **Storage:** reuse `useLocalStorage` (`src/hooks/useLocalStorage.ts`) with key `bridge:recently-viewed`, value `Array<{ key: string; title?: string; viewedAt: number }>`. The hook already syncs across tabs via the `storage` event and handles quota errors — re-use, don't reinvent.
- **Recording:** add a small `recordTicketView(key, title)` helper (or `useRecordTicketView()` hook) backed by the same storage key — side-effect-only so it drops into existing callbacks without restructuring. Call from:
  - `selectTicket(key)` in `src/components/sprint-board/SprintBoard.tsx` (~line 211)
  - mount/load of `src/app/(app)/tickets/[key]/page.tsx` (the resolved `routeKey`)
  - the Refinement session ticket view (`src/components/refinement-session/SessionTicketView.tsx`)
  - the side-panel `onSelectTicket` callback in `src/app/(app)/tickets/[key]/page.tsx`
- **Capture the title at record time** so the popout renders without an extra fetch; fall back to showing just the pill if the title is unknown.
- **Watch React Compiler lint rules** (no setState-in-effect): prefer recording inside the existing data-load/selection callback over a bare `useEffect` that sets state.
- **Panel integration:** add a third view to `NavPanel.tsx` alongside `NavigationView` / `AccountView`, toggled by panel-local state the same way `accountOpen` flips the account view (`NavPanel.tsx:110`, `:171`). Render entries as hairline rows reusing the `revealStyle(open, i)` stagger and the existing row classes. This keeps the popout on the current page for free, since the panel is an overlay.
- **Navigation:** link entries to the canonical `/tickets/{key}` route (works from anywhere) and call `onClose()` on click, matching the existing nav rows.
- **Pill:** reuse `TicketRefPill` (`src/components/shared/TicketRefPill.tsx`) for visual consistency with description/chat pills.

## Out of Scope

- Cross-device / server-side sync (localStorage only).
- Surfacing recently-viewed in the command palette or a separate header control (this story is scoped to the nav panel).
- Recording Story Writer session opens as "ticket views" (sessions aren't always a Jira ticket); can be added later if useful.
- Pinning / favouriting tickets, or any manual curation of the list — this is purely automatic MRU.
- Showing rich metadata (status, assignee, scores) in the list beyond pill + title.

## v2 (post-ship polish)

Decided via /dev/exploration/recently-viewed: the panel widens to 480px while the flip-view is open (reverts on back), and rows use the epic-table list anatomy via `TicketStatusPill variant="list"` (loose type icon, key, status chip) so the key keeps its copy/share dropdown (BRDG-327). Added: day group headers (Today / Yesterday / Earlier), relative age per row, a pulse on the ticket currently open, a friendlier empty state, and a footer with count + Clear (`clearRecentlyViewed` in the store). The view moved to `src/components/nav/RecentlyViewedView.tsx` with its own test suite; the stagger helper moved to `src/components/nav/revealStyle.ts`.
