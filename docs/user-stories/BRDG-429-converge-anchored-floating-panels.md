# BRDG-429: Converge the anchored floating panels on one primitive

**Status:** Not Started
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

- [ ] One anchored-panel primitive; `Popover`/`BasePicker`/`AnchoredMenu`/`CursorMenu` and the
      per-file `absolute z-50` dropdowns route through it (or are removed).
- [ ] Consistent Escape + outside-click + collision across all anchored panels.

## Tests

- [ ] Behaviour test for the primitive (open/close, Escape, outside-click, flip on collision).
- [ ] Existing picker/menu/filter tests stay green.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent.
- [[BRDG-421-converge-buttons-and-menu-items]] — `MenuList` rows live inside this container.
- [[BRDG-428-zindex-scale-authoritative-on-anchored-overlays]] — shared z token.
