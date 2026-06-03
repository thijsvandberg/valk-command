# BRDG-265: Refinement Hover Card on the Sprint Board Gem

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I hover the small **gem indicator** on a sprint-board row, I want a rich
**hover card** instead of the current plain text tooltip ("In refinement: 2026-06-02").

Today the gem only tells me *that* a ticket is in a refinement and the session name. I have
no way, from the board, to see what else is in that refinement, to pull a ticket out of it,
to move it into another, or to jump straight to the session. I have to open the ticket detail
or navigate to the refinement page. This story upgrades the gem indicator into an actionable
card so refinement membership can be managed inline from the board.

The data needed is already loaded client-side: `useTicketSessionMap` / `useRefinementSessions`
expose each draft session with its full `ticketKeys` list and name, so the card can render
sibling tickets without a new fetch.

## Requirements

### 1. Hover card replaces the plain tooltip

- Hovering (and keyboard-focusing) the gem on a sprint-board row (`TicketRow`, and the same
  indicator in `BoardRow`) opens a floating **card**, not the current single-line `Tooltip`.
- The card opens on hover with a small delay and stays open while the pointer is over the gem
  **or** the card itself (hover-bridge), so the user can move into it to click. It closes on
  pointer-leave / blur / Escape / outside click.
- It is rendered in a portal and positioned next to the gem, consistent with the existing
  `TicketHoverCard` / `DropdownPortal` pattern in `TicketStatusPill.tsx`.

### 2. One section per refinement session

A ticket can be in more than one draft session. The card shows a section per session the
ticket belongs to. Each section has:

- A **header**: the gem + the session name + a right-aligned item **count** (e.g. "5 items").
  The header is a plain title (it is *not* the open affordance; see req. 4).
- The **list of items (tickets)** in that session: ticket key pill + title (truncated), with the
  hovered ticket clearly highlighted (brand-tinted row + accented key pill).
- If the list is long, cap the visible rows (e.g. show first N) and indicate the remainder
  ("+3 more"), linking to the session for the full view. Log/note the cap rather than silently
  truncating.

### 3. Remove the ticket from a refinement

- Each session section offers a way to **remove the hovered ticket** from that session
  (e.g. a small "Remove from refinement" action / "x").
- Removal PATCHes the session with the ticket key filtered out of `ticketKeys`
  (`api.refinementSessions.update(id, { ticketKeys })`), then `mutate()`s so the board gem
  updates immediately (the gem disappears if it was the last session).
- Optimistic update with rollback + toast on failure, consistent with other board mutations.
- Removing the ticket only edits membership; it never deletes the session itself.

### 4. View / link to the refinement

- Each session section has a primary **"View refinement"** button (filled, brand-coloured,
  with a trailing arrow) that navigates to `/refinement/{id}`. This is the clear, deliberate
  open action (the subtle header-link affordance tested poorly).
- Where a long list is capped, the "+N more" affordance also links to `/refinement/{id}`.
- Navigation uses the app router (client-side), matching how `TicketMetaContent` and the
  add-to-refinement toast already link to sessions.

## Out of scope

- **Adding the ticket to another refinement from this card.** A throwaway preview compared
  layouts and the chosen "compact list" deliberately drops the in-card "Add to another"
  action to keep the card focused. Adding tickets to a refinement stays available via the
  sprint-board multiselect toolbar + `AddToRefinementModal`.
- Changing the gem icon itself, or showing the gem anywhere it isn't already shown
  (search results, etc.).
- Reordering tickets within a refinement, or editing session name/notes from the card.
- Bulk membership editing across multiple selected board rows (the multiselect toolbar +
  `AddToRefinementModal` already cover bulk *add*).
- Showing completed sessions (the map already excludes `status === "completed"`).
- Touch/long-press behaviour for the hover card (board hover affordances are pointer-first
  today); revisit only if needed.

## Technical notes

- **Indicator location:** `src/components/sprint-board/TicketRow.tsx` (~L303) and
  `src/components/sprint-board/BoardRow.tsx` (~L432) currently wrap a `<Gem>` in
  `Tooltip content={`In refinement: ...`}`. Replace both with a shared
  `RefinementGemHoverCard` so the two row variants stay in sync (avoid duplicating the
  popover logic in each).
- **Data:** `useTicketSessionMap` returns `ticketSessionMap` (key -> `{id, name}[]`) plus the
  full `sessions` and a `mutate`. The hover card needs each session's full `ticketKeys` to list
  siblings, so pass through the richer `sessions` data (or extend `TicketSessionEntry`), rather
  than only `{id, name}`. Resolve sibling titles from the board's existing ticket data where
  available; fall back to showing the key alone if a title isn't loaded.
- **Mutations:** add/remove both go through `PATCH /api/refinement-sessions/{id}` with a full
  replacement `ticketKeys` array (see `src/app/api/refinement-sessions/[id]/route.ts`); there
  is no per-ticket add/remove endpoint and none is needed. Use `refinementSessions.update`
  from `src/lib/api-client.ts`, then `mutate()` the sessions SWR key. The PATCH already emits
  `session:updated`, so the refinement page stays in sync via SSE.
- **Hover card mechanics:** model on `TicketHoverCard` + `DropdownPortal` in
  `src/components/shared/TicketStatusPill.tsx` (portal, positioning, open/close timers,
  outside-click). Consider whether a small shared hover-card primitive is warranted or whether
  reusing the `Popover`/portal helpers is enough — prefer reuse over a new abstraction.
- **Add flow:** reuse `src/components/refinement-session/AddToRefinementModal.tsx` with
  `ticketKeys={[ticket.key]}`; wire its `onAdded` to the same toast pattern used in
  `SprintBoard.tsx` (success toast + "Open refinement" link).
- **Accessibility / interaction:** gem must be keyboard-focusable and the card reachable; stop
  pointer/click propagation so opening the card or its actions doesn't trigger row selection /
  navigation (rows handle their own `onPointerDown`/`onClick`).
- **Design:** follow the project's frontend guardrails (brand colors, layered card surface,
  `transform`/`opacity` transitions only, hover/focus/active states). The card is an
  "elevated/floating" surface above the row.

## Decisions

- **Layout (chosen via preview):** the "compact list" direction — a wide (~440px) card with a
  plain title header (gem + session name + item count), one row per ticket (key pill + title,
  remove × on hover), and a single primary **"View refinement"** button right-aligned in the
  footer. No "Add to another" action in the card.
- **Open affordance:** a filled brand-coloured "View refinement →" button, not a subtle header
  link (the subtle version read as unclear in review).
- Sibling ticket titles: render from already-loaded board data when present; key-only fallback
  otherwise (no extra fetch just to populate the card).
- **Remove is one-click** (no confirm): optimistic + rollback toast on failure, since it only
  edits membership and is easily re-added.

## Implementation Plan

(Generated by the Opus planning pass; grounded in the current code.)

**Prerequisite — data threading (checklist 7):** `TicketSessionEntry`
(`src/hooks/useTicketSessionMap.ts`) currently carries only `{ id, name }`. Extend it to
`{ id, name, ticketKeys: string[], ticketCount: number }`, populated from the session already in
`useRefinementSessions` (no refetch). For sibling **titles**, build a `Map<key,title>` from the
board's already-loaded `tickets` in `TicketTable` and thread it to both rows as a new
`ticketTitleMap` prop; the card does `titleMap.get(key) ?? key` (key-only fallback for tickets
not on the current board view).

1. **Shared component** `src/components/sprint-board/RefinementGemHoverCard.tsx`: a
   `RefinementGemTrigger` (wraps the *existing* gem markup as `children`, owns open/close timers +
   hover-bridge state, focusable) plus the portal `RefinementGemHoverCard` (positioning/flip/portal
   copied from `TicketHoverCard`/`DropdownPortal` in `TicketStatusPill.tsx`, width `w-[440px]`,
   Escape + outside-click + scroll-close). Port the visual structure from the preview
   `src/app/(app)/dev/refinement-hover/page.tsx`.
2. **Swap the Tooltip** in `TicketRow.tsx` (~L303, bare faint gem) and `BoardRow.tsx` (~L431, tinted
   badge+count) — wrap each existing gem with `RefinementGemTrigger`; keep their distinct trigger
   looks. Open on hover (≈300ms) + focus; close on leave/blur/Esc/outside.
3. **One section per session** (`sessions.map`): plain title header (gem + name + right-aligned
   `N items`), member rows (`KeyPill` + title), current ticket highlighted (brand-tinted row +
   accented pill). Divider between stacked sections.
4. **Cap** at `MAX_VISIBLE_ROWS` (≈8) with a `+N more` row linking to `/refinement/{id}`; comment the
   cap (no silent truncation).
5. **Remove** handler lives in `SprintBoard.tsx` (where `mutate`/`router`/`showToast` already are):
   optimistic SWR `mutate(updater, { optimisticData, rollbackOnError })` calling
   `api.refinementSessions.update(id, { ticketKeys: without(key) })`; show toast only on failure.
   Gem auto-hides when the removed session was the ticket's last. Never `delete` the session.
   Add `mutate`/`sessions` to the `useTicketSessionMap()` destructure in `SprintBoard`; pass
   `onRemoveFromRefinement` down the `TicketTable` → rows → card path.
6. **View refinement**: filled brand button (one per section) → `onNavigate(id)` → `router.push`.
   Render as `<a href="/refinement/{id}">` with `onClick preventDefault` for middle-click + correct
   href in tests. Router works inside the portal (same React tree).
7. Data threading — see prerequisite above.
8. **Stop propagation** on the trigger wrapper and every interactive card element so row
   select/drag/navigation never fires.
9. **Keyboard + guardrails**: focusable trigger, `aria-label`s, brand CSS vars only, fade
   (transform/opacity) like the existing hover card.
10. **Tests** `RefinementGemHoverCard.test.tsx`: open/close (hover/focus/Esc/outside + hover-bridge),
    section/member rendering + title fallback + current-row highlight, `+N more` past the cap,
    remove success (calls `update` with filtered keys + `mutate`) and failure (rollback toast),
    `View refinement` href.

**Risks:** `TicketSessionEntry` shape change ripples to test fixtures building literal entries
(grep + fix). Keep `BoardRow`/`TicketRow` trigger visuals distinct (wrap, don't unify). The
TicketStatusPill "In refinement" line in `BoardRow` stays (separate, larger card). Keep
`ticketCount` in sync with `ticketKeys.length` optimistically so header/badge counts update
instantly. Ensure internal list scroll doesn't trigger close-on-scroll (bind to `window` capture).

## Checklist

- [x] Extract a shared `RefinementGemHoverCard` component used by both `TicketRow` and `BoardRow`
- [x] Replace the plain `Tooltip` on the gem with the hover card (hover + focus open, hover-bridge, Esc/outside-click close)
- [x] One section per session: title header (gem + name + item count), lists member tickets with the hovered ticket highlighted
- [x] Cap long lists with "+N more" linking to `/refinement/{id}` (no silent truncation)
- [x] Remove-from-refinement action (× on hover): optimistic PATCH `ticketKeys`, `mutate`, rollback + toast on failure
- [x] Primary "View refinement" button navigates to `/refinement/{id}` (client-side router)
- [x] Pass session `ticketKeys` (and sibling titles where available) through `useTicketSessionMap` / row props
- [x] Stop propagation so card and actions don't trigger row select/navigation
- [x] Keyboard accessible; respects frontend design guardrails
- [x] Tests: hover card open/close, member list rendering, remove (success + rollback), "View refinement" link href
- [x] Verify visually on the sprint board <!-- list view (TicketRow): card opens on gem hover with real titles, current ticket highlighted, remove × reveals on row hover, hover-bridge holds, View refinement button. Board variant shares the component; multi-session rendering covered by unit tests. -->
- [x] Update relevant docs if needed (refinement behaviour) <!-- no architecture doc describes the sprint-board gem UI; this story is the record. API/data layer unchanged (reuses existing PATCH). -->
- [x] Remove the temporary preview route `src/app/(app)/dev/refinement-hover/` once the real card ships <!-- moved to deleted/app-dev-refinement-hover/ per the no-delete rule -->
