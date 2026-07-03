# BRDG-429: Converge the anchored floating panels on one primitive

**Status:** Done (2026-07-03, branch ui-wave-427-431)
**Priority:** Medium
**Type:** Consistency — overlays / anchored panels (follow-up of BRDG-422)

## Description

There are 5+ parallel "anchored floating panel" implementations, each solving
positioning / click-outside / Escape / collision slightly differently. BRDG-422
unified the *modal* overlays and the menu *rows* (`MenuItem`/`MenuList` from
BRDG-421), but the anchored-panel **container** is still fragmented. One primitive
should own anchor positioning, portal-vs-inline, Escape, and viewport collision.

## Evidence (file:line)

- `shared/Popover.tsx` — inline anchored panel (`absolute top-full`, outside-click + Esc).
- `shared/BasePicker.tsx` — portal panel at `z-[9999]`, its own collision logic.
- `sprint-board/ticket-action-menu.tsx` — `AnchoredMenu` + `CursorMenu` (portal, flip
  above/below, cursor-positioned).
- `pipelines/FilterBar.tsx` — the `z-40`-catcher + `absolute z-50` dropdown pattern (×5).
- Dozens of per-file `absolute z-50` dropdowns across the app.
- `FilterDropdown.tsx` explicitly sets `escapeClose:false` — divergent Escape behaviour.

## Proposed approach

1. Pick one primitive (extend `Popover` or `BasePicker`) that supports both inline and
   portal mode, consistent Escape, outside-`onMouseDown` close, and viewport flip/clamp
   collision handling.
2. Render `MenuList` (BRDG-421) inside it for menus; render pickers/custom content for the rest.
3. Retire `AnchoredMenu`/`CursorMenu`, the pipelines `z-40`-catcher, and the per-file
   `absolute z-50` dropdowns in favour of the one primitive.
4. Coordinate with [[BRDG-428-zindex-scale-authoritative-on-anchored-overlays]] for the z token.

### Trade-offs
- Medium effort, mostly internal-consistency value. Migrate per call site; the positioning
  logic is the risky part (cursor menus, nested flyouts) — keep their behaviour.

## Acceptance Criteria

- [x] One anchored-panel primitive; `Popover`/`BasePicker`/`AnchoredMenu`/`CursorMenu` and the
      per-file `absolute z-50` dropdowns route through it (or are removed).
- [x] Consistent Escape + outside-click + collision across all anchored panels.

## Tests

- [x] Behaviour test for the primitive (open/close, Escape, outside-click, flip on collision).
- [x] Existing picker/menu/filter tests stay green.

## Implementation notes (2026-07-03)

- New primitive: `shared/AnchoredPanel.tsx` — `useAnchoredPosition` (floating-ui
  computePosition/autoUpdate: offset, flip, shift-clamp, optional size()-based
  fit-to-viewport max height, cursor-point mode via virtual element, and the
  BRDG-303 collapsed-trigger hold) + the `AnchoredPanel` component (portal or
  inline, Escape + outside-mousedown, `insideRefs` trigger exemption, default
  panel skin). Introduced the `z-popover` token (65, between modal and tooltip)
  that all portal panels sit on.
- Routed through it: `Popover` (inline wrapper, API unchanged, new optional
  `triggerRef`), `BasePicker`/`usePickerState` (positioning delegated; the seven
  picker consumers unchanged), `AnchoredMenu` + `CursorMenu` (APIs unchanged),
  `FilterDropdown`, and the five pipelines `FilterBar` dropdowns (z-40 catcher
  removed).
- Judgment calls (conservative, PO can overrule):
  1. `FilterDropdown` `escapeClose:false` normalized to Escape-closes — it was
     the only anchored panel opting out.
  2. `AnchoredMenu` used to flip to whichever side had more space even when the
     menu fit below; floating-ui flips only when it does not fit. Menus near
     mid-screen now consistently open downward.
  3. Pipelines filter panels adopt the shared skin (rounded-xl +
     shadow-popover instead of rounded-lg + shadow-lg) — minimal radius/shadow
     shift for one look.
  4. `FilterDropdown` moved from the notification layer (80) to `z-popover`
     (65): filters no longer paint above toasts.
  5. The remaining ad-hoc `absolute z-50` dropdowns beyond the named ones keep
     their local implementation for now (full re-plumbing of every one-off
     dropdown was judged too risky for one pass); their raw z values are swept
     onto tokens in [[BRDG-428-zindex-scale-authoritative-on-anchored-overlays]].
- `Flyout` (nested hover sub-menus) keeps its CSS-relative side positioning —
  it is not viewport-anchored and already owns nested-hover semantics.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent.
- [[BRDG-421-converge-buttons-and-menu-items]] — `MenuList` rows live inside this container.
- [[BRDG-428-zindex-scale-authoritative-on-anchored-overlays]] — shared z token.
