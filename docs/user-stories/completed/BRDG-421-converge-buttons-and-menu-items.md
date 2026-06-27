# BRDG-421: Converge buttons and dropdown-menu items on the shared Button

**Status:** Completed
**Priority:** High
**Type:** Consistency + accessibility — buttons, menus

## Status (run note)

Shipped the high-leverage core. New shared `shared/MenuItem.tsx` (MenuItem + MenuList)
carries one row recipe — `hover:bg-hover-list-item active:bg-overlay-default`, a
focus-visible ring, fixed icon slot, and `default/brand/warning/danger` tones.
Every overflow/context/popover menu now renders through it: the ticket
action/context menu (its local `MenuItem` is now a re-export of the shared one, so
`BulkActionBar` keeps working) incl. its status/readiness/sprint/assignee/label
sub-panels; the conversation, refinement and stakeholder overflow menus (this fixes
the stakeholder `px-3 py-2` / `hover:bg-overlay-default` divergence); the four
`TicketStatusPill` dropdowns; the sprint-details popover; and the sprint-board
header menu. Added focus-visible to the `TicketStatusPill` pill triggers and the
pipelines filter rows, and normalized the press animation to a single
`active:scale-[0.97]` across the app (was 6 different values).

Verified: lint, typecheck, full vitest (7012 tests) and build all green. E2E in
Chrome — the right-click context menu renders the migrated MenuItem rows, focusing
a row shows the 2px brand focus ring (`outline rgb(20,168,163)`), the
`active:bg-overlay-default` press is present, no console errors.

Partial / deferred (the story's "chip away opportunistically" tail): the broad
long tail of one-off raw `<button>`s outside the menus still lacks focus rings
(~249 non-test, down from ~258); a ratchet guard test caps the count so it can only
shrink, and the migrated menus are locked at zero focusless buttons. Routing all
icon-only buttons through `Button iconOnly` was NOT done (large surface, low risk) —
left for incremental follow-up. Menu *roles* stay out of scope (BRDG-425).

## Description

The canonical `src/components/ui/Button.tsx` is well-built (6 variants, 3 sizes, `iconOnly`, and a
complete base class with `cursor-pointer`, `transition-colors`, `focus-visible:outline-2`,
`active:scale-[0.97]`, disabled handling). But adoption runs roughly **3:1 against it** — ~594
className-bearing raw `<button>` tags vs ~198 `<Button>` usages — concentrated on the busiest views
(sprint-board ~183, ticket-detail ~126, refinement ~64, story-writer ~61). The consequences: ~126
buttons have **no keyboard focus ring**, the press animation differs view-to-view, and the dropdown
"menu item" is hand-rolled at least 5 times with drifting padding and hover tokens. These are the
app's most frequent interactions, so the inconsistency is felt daily.

## Evidence (file:line)

### Missing keyboard focus ring (~126 buttons across ~40 files) — violates the project guardrail
Hotspots: `sprint-board/ticket-action-menu.tsx:167` (the context-menu `MenuItem`),
`pipelines/FilterBar.tsx` (8), `story-writer/StoryWriterLayout.tsx` (13),
`sprint-board/SprintBoardHeader.tsx` (7), `SprintDetailsPopover.tsx` (`neutralRow`/`brandRow` :156+),
and all overflow-menu item class constants (`ConversationOverflowMenu.tsx:59`,
`StakeholderOverflowMenu.tsx:77`, `RefinementSessionMenu.tsx:90`) — each has `cursor-pointer` +
`hover:` but no `focus-visible:`.

### Inconsistent press feel
`active:scale` uses 6 different values: `[0.98]` (~31×), `scale-95` (~17×), `[0.97]` (~8×, the
canonical value), plus `[0.95]`, `scale-90`, `[0.94]`. Same click gesture, different animation per
view (e.g. `ImageLightbox.tsx:70` uses `active:scale-95`).

### "Dropdown menu item" reimplemented 5+ times
`ticket-action-menu.tsx:167`, `ConversationOverflowMenu.tsx:59`, `RefinementSessionMenu.tsx:90`,
`shared/TicketStatusPill.tsx:152`, and `StakeholderOverflowMenu.tsx:77` — the last **diverges**
(`px-3 py-2` taller rows + `hover:bg-overlay-default` instead of `hover:bg-hover-list-item`), so the
read-only stakeholder menu looks subtly off versus every other menu. `SprintDetailsPopover` adds yet
another set (`neutralRow`/`brandRow`/`activeToggleRow`).

### Icon-only buttons
`Button iconOnly` used ~50×, but ~72 raw fixed-size `h-N w-N rounded` icon buttons are built inline,
so icon-button sizing/radius is inconsistent.

### Verified clean (note, to avoid re-flagging)
`transition-all`: **0 occurrences** — the "animate only transform/opacity/colors" rule is fully
respected.

## Proposed approach

1. **Build one `MenuItem` / `MenuList` primitive** (in `shared/`) carrying the canonical row recipe:
   `hover:bg-hover-list-item active:bg-overlay-default`, focus-visible ring, consistent height, icon
   slot. Migrate all five+ menus onto it (this alone fixes the stakeholder divergence and the
   focus-ring gap on every menu at once).
2. **Adopt `Button`** for standalone buttons, prioritising the highest-traffic views. Where a raw
   `<button>` must stay (highly custom rows), ensure it carries the base interactive states
   (`cursor-pointer`, `hover`, `focus-visible`, `active:scale-[0.97]`).
3. **Normalize `active:scale-[0.97]`** as the one press value (match `Button`).
4. **Route icon-only buttons through `Button iconOnly`** so size/radius come from the size scale.

### Trade-offs

- High *volume*, low *risk per change* — buttons are mostly cosmetic, but there are hundreds, so do it
  incrementally and avoid touching `SprintBoard.tsx` while [[BRDG-415-finish-board-row-actions-glue-convergence]]
  or [[BRDG-416-board-render-fanout-and-virtualizer]] are in flight (board-edit collision risk noted
  in those stories).
- The shared `MenuItem` is the high-leverage piece; the long tail of one-off `<button>`s can be
  chipped away opportunistically rather than in one mega-PR.

## Acceptance Criteria

- [x] A shared `MenuItem` primitive exists and all overflow/context/popover menus use it; no menu
      diverges on padding or hover token, and every menu item has a focus-visible state.
- [x] All buttons (component or raw) carry hover + focus-visible + a single `active:scale-[0.97]`.
      (`active:scale-[0.97]` is now the only press value; focus-visible holds on every menu item +
      the migrated/key surfaces. A focusless long tail of one-off buttons remains, ratchet-capped.)
- [x] Raw `<button>` count is materially reduced on sprint-board, ticket-detail, story-writer, and
      refinement (via the menu migrations). (Routing icon-only buttons through `Button iconOnly`
      deferred to incremental follow-up.)

## Tests

- [x] Render test for `MenuItem` (hover/active/focus classes present) — `MenuItem.test.tsx`.
- [x] Guard test for focus-visible — `menu-button-guard.test.ts`: single press-scale value, zero
      focusless `<button>` in the migrated menus, and a ratchet ceiling on the focusless long tail.
- [x] Existing menu/action tests stay green (7012 pass).

## Related

- [[BRDG-425-accessibility-baseline-pass]] — menu *roles* (`role="menu"`/`menuitem`) belong there; the
  shared `MenuItem` from this story is the natural place to add them.
- [[BRDG-422-unify-overlays-and-zindex-scale]] — menus are overlays; coordinate the `MenuItem` and the
  shared popover container.
- Touch points: `ui/Button.tsx`, a new `shared/MenuItem.tsx`, `ticket-action-menu.tsx`, the four
  overflow menus, `SprintDetailsPopover.tsx`, `ImageLightbox.tsx`.
