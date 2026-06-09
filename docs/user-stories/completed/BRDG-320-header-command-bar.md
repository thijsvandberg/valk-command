# BRDG-320: Header command bar (wordmark menu + command capsule)

**Status:** Draft
**Priority:** Medium
**Type:** Improvement
**Related:**
- `src/components/shared/ViewHeader.tsx` (the fixed top bar: `bridge_` wordmark, view-context children, right-side actions; portal-rendered)
- `src/components/FocusModeWrapper.tsx` (mounts the `#view-header-portal`; renders the floating `Sidebar` launcher)
- `src/components/Sidebar.tsx` (the floating bento launcher + its nav panel: hero card, counts, account menu, sync, corner-snap drag — BRDG-317)
- `src/components/sidebar/accountMenuItems.ts`, `src/hooks/useSidebarData.ts`, `src/components/sync/SyncIndicator.tsx` (panel content the trigger must keep)
- `src/hooks/useOutsideClick.ts` (outside-click + Esc close), `src/hooks/useCornerSnap.ts` (current launcher drag)
- `src/app/globals.css` (brand tokens, `--color-brand-glow`; new caret keyframe lives here)
- Design reference: `/dev/exploration/header` (variant **F · Caret Command Bar** chosen)

## Description

As the PO, I want the primary navigation to live in the fixed top bar instead of a floating launcher I
have to find in a corner, and I want that top bar to feel like one deliberate "command" surface rather
than a flat row of unrelated controls.

Today:
- The `bridge_` wordmark sits alone on the left of `ViewHeader`; nothing else carries the brand and the
  left side reads as a loose row (wordmark · divider · view context).
- The nav menu is hidden inside a **floating bento launcher** (`Sidebar.tsx`) that corner-snaps and must
  be hunted for. A fixed, predictable button in the header is more logical for a single-user console.

## Decisions (resolved with PO)

- **Direction:** exploration variant **F · Caret Command Bar** — see `/dev/exploration/header`.
- **No beeldmerk.** The aperture logomark (`BridgeMark`) is explicitly dropped from the header. The brand
  carries entirely through the **`bridge_` wordmark**: its teal underscore is promoted to a slow blinking
  **console caret**, backed by Space Mono type and the teal accent. (Reinforces the existing
  wordmark-over-beeldmerk brand decision.)
- **The wordmark becomes the nav trigger.** A small hamburger glyph sits before it for an explicit
  affordance; clicking opens the nav menu as a dropdown anchored under the trigger (top-left).
- **Reuse the existing launcher panel, don't rebuild a simpler menu.** The launcher's panel content
  (nav items + live counts, account header, sync line, MORE row) is the menu; only its **trigger and
  anchoring** change — from a draggable corner launcher to a fixed header dropdown.
- **The floating bento launcher is retired** in favour of the header trigger (one predictable nav entry).
  Corner-snap drag goes away. (See open questions for the "keep both" fallback.)
- **Favicon is out of scope.** The wordmark won't read at 16px, so the favicon still needs its own mark —
  tracked separately, not in this story.

## Goal

Restructure the left half of `ViewHeader` into a single brand-tinted command capsule, following
variant **F**:

```
 ┌─ command capsule (brand-tinted, left glow) ─────────────┐
 │  ☰  bridge_   │   📅 BT: 139 ●                           │        [SP|BV|#] ▱▱ 0%  day 2/10   🔔⁹⁺ 🔍 ⋯
 │  └ wordmark = menu trigger ┘  └ view context (children) ┘│        └──── fullness meter ────┘  └ actions ┘
 └─────────────────────────────────────────────────────────┘
```

1. **Command capsule** — the menu trigger + view-context children sit inside one rounded, subtly
   brand-tinted container (`bg-overlay-subtle`, hairline ring) with a soft radial brand glow bleeding in
   from the left edge of the bar, so the left side reads as one console unit.
2. **Menu trigger** — hamburger glyph + `bridge_` wordmark (with the blinking teal caret underscore).
   Hover tints the glyph teal. Clicking toggles the nav dropdown.
3. **Nav dropdown** — drops from the trigger (top-left origin). Reuses the launcher panel: account header
   (avatar, name, Synced · …), primary nav with live counts (Sprint Board, Chat unread, Story Writer
   drafts, Refinement to-refine), and the MORE row (Epics, Pipelines, Stakeholder, Cleanup).
4. **Right side unchanged** — fullness meter, notifications (9+ badge), search, overflow, focus-mode
   reveal all behave exactly as today.

## Behaviour

- The caret blink is **opacity-only** (`@keyframes`), respecting the motion rules (transform/opacity only,
  no `transition-all`).
- The dropdown closes on outside click and Esc (reuse `useOutsideClick`); the trigger has `cursor-pointer`,
  hover, and `focus-visible` states. Arrow-key nav through items is a nice-to-have, not required.
- Because `ViewHeader` is portal-rendered into `#view-header-portal` on **every** view, the nav becomes
  reachable from every page (an improvement over the launcher, which was global but easy to lose).
- **Focus mode:** the header portal slides up in focus mode (today) and the launcher also hides
  (`{!focusMode && <Sidebar/>}`). Moving nav into the header keeps parity — no nav surface in focus mode,
  same as now; the floating exit button is unaffected.
- Active route is indicated in the dropdown (the launcher already knows the pathname via `usePathname`).

## Implementation Plan (refined with Opus Plan agent)

**Decomposition:** `NavPanel` is a new component at `src/components/nav/NavPanel.tsx` that is *smart but
visibility-controlled*: it owns all its data (`useSidebarData`, `usePathname`, `useUser`,
`useAccountMenuItems`), the `isActive` rules and the account-flip state, and takes only `{ open, onClose }`.
`ViewHeader` owns just the open boolean, the trigger button and the anchoring wrapper + refs. This keeps
the heavily-reused, portal-rendered `ViewHeader` thin and its prop surface unchanged.

**Panel content:** per the Decisions above, reuse the FULL launcher panel (Sprint Board hero with live
status, progress bar, common rows with counts, MORE footer, account flip + sign out) — not the
exploration's hardcoded mock. Adopt variant F's dropdown *shell* (rounded-2xl, `ring-1 ring-border-strong`,
top accent gradient, anchored `absolute top-[calc(100%+10px)] left-0`) and size it to fit the real hero
(~360px). The exploration's compact rows are directional, not literal.

1. **globals.css** — add the caret keyframe next to the existing `@keyframes` block:
   `@keyframes bridge-blink { 0%,55%{opacity:1} 60%,95%{opacity:.25} 100%{opacity:1} }` +
   `.bridge-caret { animation: bridge-blink 1.5s steps(1,end) infinite; }`. Opacity-only.
2. **NavPanel.tsx** — lift the panel internals out of `Sidebar.tsx` (NAV_ITEMS/PRIMARY/COMMON/RARE, ICON,
   `revealStyle`, `HeaderAvatar`, `NavigationView`, `AccountView`, `isActive`, account header markup, data
   wiring). Drop the launcher button, backdrop, `useCornerSnap`, `PANEL_CORNER_CLASSES`, `PANEL_SHADOW`,
   and the `data-testid="sidebar"` wrapper. Render inline-absolute under the trigger; `onClose` fires on
   navigate / account-route select.
3. **ViewHeader.tsx** — add `open` state + `triggerRef`/`panelRef` + `useOutsideClick([triggerRef,
   panelRef], close, { enabled: open })` (gives outside-click + Esc). Replace the standalone wordmark +
   divider with the **command capsule**: rounded `bg-overlay-subtle` + hairline ring wrapping (a) the
   trigger (`Menu` glyph + `bridge` + caret underscore span; `aria-haspopup`, `aria-expanded`,
   `aria-label="Open navigation"`, cursor/hover/focus-visible) with `<NavPanel>` in an anchored wrapper,
   (b) a thin separator, (c) the existing `icon` + `children` slot (keep `min-w-0 flex-1` so titles
   truncate). Widen/strengthen the existing left brand glow to match F. Right actions stay outside the
   capsule, unchanged.
4. **FocusModeWrapper.tsx** — remove the `import Sidebar` and the `{!focusMode && <Sidebar/>}` line. Focus
   exit button + `#view-header-portal` slide-up untouched. The existing
   `body.refinement-session-active #view-header-portal { display:none }` rule already hides nav in
   refinement, so parity holds automatically.
5. **Move `Sidebar.tsx` → `deleted/Sidebar.tsx`** (never-delete convention) once its internals live in
   NavPanel.
6. **Tests** — rework `Sidebar.test.tsx` into:
   - `src/components/nav/NavPanel.test.tsx`: render `<NavPanel open onClose={spy}/>` directly (no launcher
     tap); port hero/status, common rows + counts, MORE links, active-route rules, account flip (theme,
     settings routing, shortcuts event, sign out), label-only fallback; replace "closes on navigate" with
     "`onClose` fires on link/account-route click". Drop drag-vs-tap + panel-visibility cases.
   - `src/components/shared/ViewHeader.test.tsx`: append a `#view-header-portal` to `document.body` in
     `beforeEach`; mock `FocusModeContext`, `NotificationBell`, and `@/components/nav/NavPanel` (stub →
     `open ? <div data-testid="nav-panel"/> : null`). Assert `aria-expanded` toggles, click opens/closes,
     Esc + outside `mousedown` close, right actions render.
   - Move the old `Sidebar.test.tsx` to `deleted/`.
7. **globals.css cleanup** — remove the now-dead `div:has(> [data-testid="sidebar"])` and the
   already-dead `#sidebar-wrapper` refinement-session selectors.
8. Run lint, typecheck, the changed tests, then full `npm run verify` + `npm run build`.

**Risks flagged:** keep `min-w-0 flex-1` on the view-context child or long titles stop truncating; if the
absolute dropdown clips inside the portal in normal mode, fall back to a body portal (last resort, since it
complicates outside-click ref containment) — prefer inline-absolute.

## Acceptance criteria

- [x] The header left side is a single brand-tinted **command capsule** (trigger + view context) with a
      soft left brand glow; no `BridgeMark`/beeldmerk anywhere in the header.
- [x] The `bridge_` wordmark (hamburger glyph + blinking teal caret underscore) is the nav trigger.
- [x] Clicking the trigger opens the nav menu as a dropdown anchored top-left, reusing the existing
      launcher panel (account header, primary nav with live counts, MORE row).
- [x] The dropdown closes on outside click and Esc; trigger has `cursor-pointer`, hover and
      `focus-visible` states; `aria-expanded` reflects open state.
- [x] The nav is reachable from every view (header is portal-rendered everywhere).
- [x] The floating bento launcher is removed; focus-mode behaviour and the floating exit button are
      unchanged.
- [x] The caret animation is opacity-only; no `transition-all`; no default-Tailwind brand colors.
- [x] Right-side actions (fullness meter, notifications + 9+ badge, search, overflow, focus toggle reveal)
      behave exactly as before.
- [x] Tests cover NavPanel contents/active-route/onClose and ViewHeader open/close/Esc/outside-click.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.

## Open questions (deferred — not blocking)

- **Keep the launcher as a fallback?** This story retires it. If the corner-snap drag is missed, a thin
  fallback is to keep the launcher available only in focus mode; revisit if needed.
- Should the dropdown also expose the **account actions** (sign out, profile) inline, or keep those behind
  the avatar sub-menu as the launcher does today? (Default: preserve current account sub-menu behaviour.)

## Notes

- A clickable, interactive mock of all six directions (F chosen) lives at `/dev/exploration/header`; the
  exploration page is intentionally **kept**, not thrown away.
- The launcher's data hook (`useSidebarData`) already provides the counts shown in the dropdown — reuse it
  rather than refetching.
- Favicon needs its own small mark (separate task) since the wordmark won't shrink to 16px.
```
