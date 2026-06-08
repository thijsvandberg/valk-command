# BRDG-317: Replace the icon rail with an editorial bento launcher

**Status:** Ready
**Priority:** Medium
**Type:** Improvement
**Related:** `src/components/Sidebar.tsx` (current rail), `src/components/sidebar/UserProfilePopover.tsx`
(account menu), `src/components/FocusModeWrapper.tsx` (layout mount), `src/components/sync/SyncIndicator.tsx`.
Direction chosen from the `/dev/sidebar` exploration page (Bento launcher → variant **A4 · Editorial**).

## Description

As the PO, I find the current left navigation cramped and visually flat: a thin 52px icon-only rail
listing eight equally-weighted destinations, with the profile and sync status pinned bottom-left. In
practice **Sprint Board is by far the most used** view, several pages are rarely opened, and the
icon-only rail gives no sense of state.

Replace the rail with a **floating bento launcher**: a small icon-only button bottom-left that opens a
floating panel. The panel uses an **editorial** presentation (airy, hairline dividers, typographic
numbers) and a clear priority hierarchy:

- **Sprint Board** is a prominent hero row with live sprint state.
- **Chat / Story Writer / Refinement** are a clean list below.
- **Epics / Pipelines / Stakeholder / Cleanup** are demoted to a faint "More" footer.

The account menu (Theme, Notifications, Keyboard shortcuts, Settings, Sign out) — currently in
`UserProfilePopover` — folds into the panel behind the avatar header. The standalone bottom-left
profile button and sync-status pill no longer live in a dedicated rail slot.

This is purely a navigation/presentation change. Routes, route guards, and the destinations
themselves are unchanged.

## Behaviour

### Collapsed (default)

- A single **icon-only launcher** button floats at the bottom-left of the viewport (grid/`LayoutGrid`
  glyph, brand-tinted, glass surface, layered shadow). No reserved rail column.
- Hover, focus-visible, and active states; `cursor: pointer`.

### Open panel (editorial)

- Clicking the launcher opens a floating panel anchored bottom-left (~380px), glass/blur surface with
  a layered, brand-tinted shadow and a soft brand glow. Opens with a staggered reveal (transform +
  opacity only). A backdrop dims the board; clicking it or pressing `Esc` closes the panel.
- **Header:** avatar + full name + email, with a chevron. Clicking the header flips the panel to the
  **account view** (see below).
- **Sprint Board hero row:** brand icon tile, "Sprint Board" in the display font, the active sprint
  key (e.g. `BT: 139`), a one-line status summary (`14 to do · 3 in progress · 2 done`), and a thin
  progress bar. Navigates to the board.
- **Common views list:** Chat, Story Writer, Refinement as hairline-divided rows — icon · label ·
  typographic count · short note (e.g. "active threads", "open drafts", "to refine").
- **More footer:** Epics, Pipelines, Stakeholder, Cleanup as quiet inline text links.
- The row matching the current route shows an **active** treatment (reuse the existing `isActive`
  logic from `Sidebar.tsx`, including `/` → Sprint Board and `*/write` → Story Writer).
- Selecting any destination navigates (via `next/link` / router) and closes the panel.

### Account view (flip)

- Reuses the existing account actions verbatim: **Theme** (toggle, shows current Dark/Light),
  **Notifications** (`/settings/notifications`), **Keyboard shortcuts** (dispatches
  `valk:openKeyboardShortcuts`), **Settings** (`/settings`), and a destructive **Sign out** (Clerk
  `signOut` + `DELETE /api/dev/bypass`, redirect to `/login`).
- Clicking the header again flips back to the navigation view.

### Sync status

- The `SyncIndicator` no longer occupies a dedicated rail slot. Surface it as a **compact line in the
  panel header**, next to the name/email (a status dot + "Synced / Syncing / last-synced time"). It
  must remain reachable; it is not removed.

### Layout & focus mode

- `FocusModeWrapper` no longer reserves the `w-[52px]` sidebar column; `main` spans full width and the
  launcher floats above it.
- In focus mode the launcher hides (consistent with the current rail slide-away).

### Mobile

- The launcher works at all breakpoints; the previous mobile drawer toggle (hamburger + overlay) is
  removed in favour of the floating launcher + panel.

## Implementation

- **`src/components/Sidebar.tsx`:** rework into the launcher + floating panel. Keep the `navItems`
  source of truth but add a tier (`primary` / `common` / `rare`) and per-view meta (count + note).
  Reuse `isActive`, `next/link` prefetch, `useOutsideClick`, and keyboard/`Esc` handling.
- **Account view:** reuse the menu definitions and handlers from `UserProfilePopover` (theme toggle,
  router pushes, the `valk:openKeyboardShortcuts` event, sign-out). Either fold them into the panel or
  extract a shared `accountMenuItems` so both stay in sync; avoid duplicating the sign-out logic.
- **`src/components/FocusModeWrapper.tsx`:** drop the reserved `w-[52px]` wrapper; render the launcher
  as a floating element; hide it in focus mode.
- **`SyncIndicator`:** relocate into the panel header; keep the `collapsed`/expanded behaviour sensible
  in the new spot.
- **Data wiring (all sources confirmed to exist and are SWR/context-cached, so safe to read from a
  global component):**
  - **Sprint hero:** `useJiraSprints()` (`src/hooks/useSprintBoard.ts`) → the sprint with
    `state === "active"` for the key/name; `useTickets(activeSprint.id)` (same file) → tickets, then
    `computeSprintStats(tickets)` and `computeSprintWorkDays(sprint)` from
    `src/components/sprint-board/sprint-board-utils.ts` for the to-do / in-progress / done counts,
    progress %, and the `day X/Y` counter.
  - **Chat count:** `useConversations()` (`src/hooks/useConversations.ts`) — count **unread**
    conversations (`readAt === null`). Note in the row reads "unread".
  - **Story Writer drafts:** `apiFetch<ActiveSession[]>("/api/story-writer/active-sessions")` → length.
  - **Refinement "to refine":** match the sprint board's existing "To refine" view — count tickets by
    the same readiness definition that tab uses (not the refinement-session count). Reuse that filter
    so the number stays consistent with the board.
  - **Sync status:** `useActivityContext()` (`src/contexts/ActivityContext.tsx`) — `activityState`
    (`idle | syncing | error`) and `incrementalSyncLastAt`; this is what `SyncIndicator` already reads.
  - Where a count momentarily has no value (loading / source empty), render the row **label-only**
    rather than a placeholder number.
- **`src/app/dev/sidebar/`:** remove (move to `deleted/`) once this ships; it is a throwaway
  exploration page.
- A reference implementation of the exact A4 layout/markup lives in `src/app/dev/sidebar/page.tsx`
  (`BodyEditorial` + `StackShell`); port its structure and tokens.

## Implementation Plan

### Phase 1 — Extract shared account actions (req 5)
1. New `src/components/sidebar/accountMenuItems.tsx`: a `useAccountMenuItems({ onClose, onNavigate })` hook returning the exact `MenuItem[]` (theme with current value, notifications, shortcuts, settings) + `signOutItem`, lifting the `useMemo`/`useCallback` blocks and `handleSignOut` (`apiFetch("/api/dev/bypass",{method:"DELETE"})` → `signOut()` → `location.assign("/login")`) verbatim out of `UserProfilePopover.tsx`. Refactor `UserProfilePopover` to consume it so sign-out is never duplicated.

### Phase 2 — Live data hook (reqs 2, 6, 11)
2. New `src/hooks/useSidebarData.ts` aggregating null-safe counts (missing → `null` → label-only):
   - Hero: `useJiraSprints()` → active sprint key/name; `useTickets(activeSprint.id)` → `computeSprintStats` (todo/inProgress/done) + `computeSprintWorkDays` (day X/Y) + progress %.
   - Chat: `useConversations()` → unread `readAt === null` count; note "unread" (return `null` while loading).
   - Story Writer: `useActiveWriterSessions()` → length; note "drafts".
   - Refinement: active-sprint tickets `readiness === "ready_to_refine"` count (matches `useRefinementQueue.readyCount`); note "to refine".

### Phase 3 — Sync line for header (req 6)
3. Extend `SyncIndicator` with `variant?: "rail" | "header-line"` (default = current `collapsed`). `header-line` renders a compact inline trigger (dot + label + last-synced) reusing existing helpers/portal. Only caller is Sidebar.tsx.

### Phase 4 — Rewrite `Sidebar.tsx` (reqs 1,2,3,4,7,8,10)
4. Port `StackShell` + `BodyEditorial` (A4) from `dev/sidebar/page.tsx`. Floating `LayoutGrid` launcher (`fixed bottom-6 left-6`), backdrop, 380px glass panel with staggered reveal, header (avatar + name + email + sync line + chevron) that flips to account view, hero row + 3 hairline common rows + "More" footer. Keep `navItems` + `isActive` verbatim; map tiers (primary/common/rare). Every row is a `next/link` that closes on navigate; `useOutsideClick([launcherRef, panelRef], close, { enabled: open })` for outside-click + Esc. Remove mobile drawer/overlay. Anti-generic: brand tokens, transform/opacity only, focus-visible/hover/active + cursor-pointer everywhere, `font-display` headings.

### Phase 5 — Layout & focus mode (req 9)
5. `FocusModeWrapper`: drop the `w-[52px]` `#sidebar-wrapper`; `<main>` spans full width; render `{!focusMode && <Sidebar/>}` so the floating launcher hides in focus mode.

### Phase 6 — dev/sidebar removal (req 12)
6. Move `src/app/dev/sidebar/` to `deleted/`.

### Phase 7 — Tests (req 13)
7. Rewrite `Sidebar.test.tsx`: mock `useSidebarData` (with a null-counts variant), keep SyncIndicator/Theme/Clerk/next mocks, mock `@/lib/api-client` + stub `location.assign`. Assert collapsed launcher, open panel (hero + 3 common + 4 rare), active state (`/`, `/chat`, `*/write`), account flip (5 items + handlers), close on Esc/outside/navigate, label-only fallback.

### Risks / notes
- `useConversations` polls and starts `loading:true` (return `null` until loaded); `useTickets` fires a background sync on mount — both already warm from the board, deduped/cached.
- After the flip view ships, `UserProfilePopover` becomes unused — extracting `accountMenuItems` satisfies the reuse requirement either way.
- Panel needs `max-w-[calc(100vw-3rem)]` for narrow viewports (req 10).

## Requirements

- [ ] Collapsed state is a single icon-only floating launcher bottom-left; no reserved rail column
- [ ] Opening shows the editorial panel: avatar/name/email header, Sprint Board hero with sprint key +
      status summary + progress bar, common views as hairline-divided rows, rare views as a faint
      "More" footer
- [ ] Sprint Board is visually the primary destination; Epics / Pipelines / Stakeholder / Cleanup are
      clearly demoted
- [ ] The current route's row shows an active state (reusing the existing `isActive` rules)
- [ ] Header chevron flips to the account view with Theme (with current value), Notifications,
      Keyboard shortcuts, Settings, and Sign out — wired to the existing handlers/routes
- [ ] Sync status remains reachable (relocated into the panel), not removed
- [ ] Panel closes on outside-click, `Esc`, and after navigating; backdrop dims the board
- [ ] Full keyboard accessibility: launcher and every row are focusable with visible focus rings;
      hover/active/`cursor: pointer` on all interactive elements; animations limited to transform/opacity
- [ ] `FocusModeWrapper` reserves no sidebar width; the launcher hides in focus mode; `main` is full width
- [ ] Works at mobile breakpoints; the old hamburger drawer is removed
- [ ] Hero/common counts use real data; rows render label-only when a count is unavailable (no fake numbers)
- [ ] `src/app/dev/sidebar/` removed (moved to `deleted/`)
- [ ] Tests updated/added (see below)

## Tests

- [ ] `Sidebar.test.tsx`: launcher renders collapsed; clicking opens the panel; renders the Sprint
      Board hero, the three common rows, and the four rare footer links
- [ ] Active-state highlighting for the current route (incl. `/` and `*/write` rules)
- [ ] Account flip shows the five account items; Sign out and the route actions invoke the right handlers
- [ ] Closes on `Esc`, outside-click, and after selecting a destination
- [ ] Label-only fallback when a count is missing

## Out of Scope

- Adding/removing destinations or changing routes and route guards.
- The Spotlight (`⌘K`) centered-launchpad direction — parked for the future (variant C on the dev page).
- Reworking the individual destination pages or the settings screens themselves.
- Any change to the board header, filters, or rows.

## Decisions

- **Counts data:** sources are confirmed and listed under Implementation → Data wiring. No new
  endpoints needed; reuse the existing hooks/utils. Rows fall back to label-only while loading/empty.
- **Sync placement:** decided — a compact status line in the panel header next to the name/email.
- **Chat count:** decided — count **unread** conversations (`readAt === null`); the row note reads
  "unread".
