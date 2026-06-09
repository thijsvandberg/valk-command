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

## Implementation Plan

### Phase 0 — Extract the nav panel from the launcher
1. Pull the panel body of `Sidebar.tsx` (account header, nav list with counts, MORE row) into a reusable
   presentational component, e.g. `src/components/nav/NavPanel.tsx`, parameterised by an `open` flag and an
   `onClose` callback. Keep `useSidebarData`, `accountMenuItems`, `SyncIndicator`, `usePathname` wiring
   inside it. The corner-snap launcher chrome is NOT part of this extraction.
2. The reveal/stagger styling (`revealStyle`) moves with the panel so the drop-in animation is preserved.

### Phase 1 — Header command capsule + trigger
3. In `ViewHeader.tsx`, replace the standalone wordmark + divider with a **command capsule**: a rounded
   `bg-overlay-subtle` container (hairline ring) wrapping the menu trigger, a thin inner divider, and the
   existing `icon` + `children` view-context slot.
4. Add the left **brand glow** (radial `--color-brand-glow`/`--color-brand-500` mix) to the bar background,
   matching the exploration.
5. Build the trigger: hamburger glyph + `Wordmark` with the caret underscore. `cursor-pointer`, hover tint,
   `focus-visible` ring; `aria-haspopup`/`aria-expanded` for the dropdown.
6. Add the caret keyframe to `globals.css` (`@keyframes bridge-blink`, opacity 1 → 0.25 → 1, ~1.5s,
   `steps(1, end)`), applied via a `bridge-caret` class on the underscore span.

### Phase 2 — Wire trigger → NavPanel + retire launcher
7. Local `open` state in `ViewHeader` (or a small `useState`); render `NavPanel` anchored
   `top-[calc(100%+…)] left-0` under the trigger. Close on outside click + Esc via `useOutsideClick`.
8. Remove the floating `Sidebar` launcher from `FocusModeWrapper.tsx` (`{!focusMode && <Sidebar/>}`). Move
   the bento-launcher-specific chrome (corner snap, drag) to `deleted/` per project convention; keep
   `useCornerSnap` only if still used by the focus-mode exit button (it is — leave that path intact).
9. Confirm no other mount points reference `Sidebar`; update imports.

### Phase 3 — Tests
10. `NavPanel.test.tsx`: renders account header, all primary items with their counts, MORE row; active
    route highlighted; `onClose` fires on item click.
11. `ViewHeader.test.tsx`: trigger toggles the panel; Esc and outside-click close it; `aria-expanded`
    reflects state; right-side actions still render. Mock the portal target (`#view-header-portal`) and
    `useSidebarData`/`useUser` as the existing suite does.
12. Verify `FocusModeWrapper` no longer renders the launcher and the header still mounts the portal.

## Acceptance criteria

- [ ] The header left side is a single brand-tinted **command capsule** (trigger + view context) with a
      soft left brand glow; no `BridgeMark`/beeldmerk anywhere in the header.
- [ ] The `bridge_` wordmark (hamburger glyph + blinking teal caret underscore) is the nav trigger.
- [ ] Clicking the trigger opens the nav menu as a dropdown anchored top-left, reusing the existing
      launcher panel (account header, primary nav with live counts, MORE row).
- [ ] The dropdown closes on outside click and Esc; trigger has `cursor-pointer`, hover and
      `focus-visible` states; `aria-expanded` reflects open state.
- [ ] The nav is reachable from every view (header is portal-rendered everywhere).
- [ ] The floating bento launcher is removed; focus-mode behaviour and the floating exit button are
      unchanged.
- [ ] The caret animation is opacity-only; no `transition-all`; no default-Tailwind brand colors.
- [ ] Right-side actions (fullness meter, notifications + 9+ badge, search, overflow, focus toggle reveal)
      behave exactly as before.
- [ ] Tests cover NavPanel contents/active-route/onClose and ViewHeader open/close/Esc/outside-click.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.

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
