# BRDG-422: Unify overlays on the shared Modal/Popover and apply the z-index scale

**Status:** Completed (core slice shipped; remainder split into BRDG-428/429/430/431)
**Priority:** High
**Type:** Consistency + accessibility — modals, popovers, layering

## Status (run note)

Shipped the safe, high-value slice; deferred the broad/high-risk sweep.

**Shipped (committed + E2E-verified):**
- Fixed the z-index *inversions* that caused real bugs: the command palette drops
  from `z-tooltip` (70) to `z-modal` (60) so it no longer paints above real dialogs
  (verified in Chrome: palette renders at z-index 60, closes on Escape); toasts
  (`ui/Toast` + `sync/SyncToast`) move to the dedicated `z-notification` (80) layer;
  the stakeholder briefing drawer leaves off-scale `z-[200]/[201]` for `z-modal`;
  `SprintStatsPopover` leaves `z-40/z-50` for `z-modal`; the shared `Popover` uses
  `z-dropdown` + `--shadow-popover`.
- `SplitStoryPicker` now routes through the shared `Modal` (Escape, focus trap +
  restore, `role="dialog"`, `aria-modal`, `--shadow-modal`).
- The remaining hand-rolled dialogs (`StoryWriterLauncherModal`, `SearchModal`,
  `CommandPalette`, `SprintStatsPopover`) gained `role="dialog"` + `aria-modal`
  (+ drag-safe `onMouseDown` close and `--shadow-modal` on the launcher). They keep
  their bespoke entrance animations / arrow-key result nav rather than fully routing
  through `Modal`.
- Guard test (`overlay-zindex-guard.test.ts`) locks the inversion fixes + dialog
  semantics; SplitStoryPicker Escape test added. lint/typecheck/vitest (7023)/build
  all green.

**Remaining work split into per-concern follow-ups (per PO request):**
- [[BRDG-428-zindex-scale-authoritative-on-anchored-overlays]] — the blanket `z-50` /
  `z-[9999]` → token sweep across the ~50 anchored pickers (with the picker-above-modal
  caveat). Includes the app-wide backdrop/radius scale.
- [[BRDG-429-converge-anchored-floating-panels]] — one anchored-panel primitive
  (Popover/BasePicker/AnchoredMenu/CursorMenu/per-file dropdowns → one).
- [[BRDG-430-unify-tooltip-and-toast]] — 4 tooltip + 4 toast implementations → one each.
- [[BRDG-431-migrate-palettes-and-launcher-onto-modal]] — full `Modal` migration of
  CommandPalette / SearchModal (animation + arrow-nav) and StoryWriterLauncherModal
  (nested-ConfirmDialog focus-trap), once `Modal` gains exit-animation + nesting-safe trapping.

## Description

`shared/Modal.tsx` already provides the hard parts of an accessible dialog: portal, `z-modal`, Escape
(capture), focus trap + restore, outside-click via `onMouseDown`, `role="dialog"` + `aria-modal`. Yet
at least 6-8 full overlays bypass it and re-implement backdrop/Escape/close inconsistently, **`aria-modal`
exists in only 2 files codebase-wide**, and the z-index token scale (`z-dropdown:50`, `z-modal:60`,
`z-tooltip:70`, `z-notification:80`) is effectively unused — `z-dropdown` appears 0 times while ~45
overlays hardcode `z-50` and ~14 jump to `z-[9999]`. The result is unpredictable stacking (the command
palette renders **above** real dialogs) and dialogs that can't be closed with the keyboard or trap
focus.

## Evidence (file:line)

### Full overlays that bypass `Modal` (no focus trap / role / aria-modal)
- `shared/StoryWriterLauncherModal.tsx:262` — hand-rolled frame, closes on `onClick` (fires on mouseup,
  unlike the canonical drag-safe `onMouseDown`); no role/aria-modal/trap.
- `sprint-board/SearchModal.tsx:158` — palette; no role/aria-modal/trap.
- `command-palette/CommandPalette.tsx:56` — uses **`z-tooltip` (70)**, so it sits above every real
  modal (`z-modal` 60); no role/aria-modal/trap.
- `sprint-board/SprintStatsPopover.tsx:222-235` — actually a centered modal; backdrop `z-40` +
  container `z-50` + backdrop `bg-black/25`; no role/aria-modal/trap.
- `story-writer/SplitStoryPicker.tsx:72` — backdrop `bg-black/60 backdrop-blur-sm`; no role/aria-modal.
- `stakeholder/StakeholderBriefing.tsx:122,129` — drawer at **`z-[200]`/`z-[201]`**, above everything
  including notifications (80).

### Layering scale unused / contradictory
- `z-dropdown` 0 uses; ~45 hardcoded `z-50`; ~14 `z-[9999]`/`zIndex:9999`; off-scale `z-[100]/[200]/
  [201]`. `Popover.tsx` hardcodes `z-50`, `BasePicker.tsx` `z-[9999]`, `Tooltip.tsx` `zIndex:9999`,
  `ui/Toast.tsx` `z-50` while `sync/SyncToast.tsx` uses `z-modal` (60) — toasts never use the dedicated
  notification layer (80).

### Token bypass on frame/shadow/backdrop
- `--shadow-modal` used only 4×; modal frames use `--shadow-2xl`/`--shadow-xl`/inline strings.
  `Popover` uses `--shadow-xl`, not `--shadow-popover`.
- Backdrop opacity spans `/25 → /30 → /55 (canonical) → /60 → /80`; blur is none/`[3px]`/`sm`/`[6px]`.
- Modal radius `rounded-lg` (27×) / `xl` (9×) / `2xl` (2×); max-width `sm`→`2xl`→`[540px]` with no
  shared scale.

### Fragmented frameworks
Five+ parallel "anchored floating panel" implementations: `Popover`, `BasePicker`,
`ticket-action-menu`'s `AnchoredMenu`/`CursorMenu`, the pipelines `z-40`-catcher pattern
(`FilterBar.tsx` ×5), and dozens of per-file `absolute z-50` dropdowns — differing on portal-vs-inline,
Escape support (`FilterDropdown` explicitly sets `escapeClose:false`), and collision handling. Also 4
distinct tooltip implementations and 4 toast implementations.

## Proposed approach

1. **Make the z-index tokens authoritative**: replace hardcoded `z-50`/`z-[9999]`/`z-[200]` with
   `z-dropdown`/`z-modal`/`z-tooltip`/`z-notification`. Fix the inversions — CommandPalette/SearchModal
   to `z-modal`, toasts to `z-notification`, `StakeholderBriefing` to a defined layer.
2. **Migrate hand-rolled dialogs onto `Modal`** (StoryWriterLauncherModal, SearchModal, CommandPalette,
   SprintStatsPopover, SplitStoryPicker) so they inherit Escape, focus trap/restore, role, aria-modal,
   and the canonical backdrop/`onMouseDown` close for free. CommandPalette/SearchModal need a "command"
   layout variant of `Modal` (top-anchored, search-first).
3. **Pick one anchored-panel primitive** (extend `Popover`/`BasePicker`) and retire the per-file
   `absolute z-50` dropdowns and the pipelines `z-40`-catcher; give it consistent Escape + collision
   handling. Consolidate the 4 tooltip and 4 toast variants.
4. **Apply `--shadow-modal`/`--shadow-popover`** and a single backdrop opacity/blur + a small
   radius/max-width scale in the shared components, so callers stop deciding per-instance.

### Trade-offs

- The z-index sweep is low-risk and high-clarity — do it first as a standalone slice.
- Migrating CommandPalette/SearchModal is the highest-value but trickiest piece (custom keyboard
  handling + entrance animation); do it after the `Modal` gains a command variant. Focus-trap behaviour
  on the palette must preserve its arrow-key result navigation.

## Acceptance Criteria

- [~] No hardcoded `z-[…]`/`z-50` on overlays; all use the four z-index tokens, and no overlay paints
      above its correct layer. **Done:** the layering inversions are fixed and the command palette no
      longer renders above dialogs. **Deferred:** the broad `z-50`/`z-[9999]` → token sweep on the ~50
      anchored pickers (they must float above modals; needs per-case care).
- [~] StoryWriterLauncherModal, SearchModal, CommandPalette, SprintStatsPopover, and SplitStoryPicker
      route through `Modal`. **Done:** SplitStoryPicker fully (Escape + trap + restore + role +
      aria-modal); the other four expose `role="dialog"` + `aria-modal` + Escape. **Deferred:** full
      `Modal` migration of the four (animations / arrow-nav / nested-modal trap conflicts).
- [ ] One anchored-panel primitive; per-file dropdown re-implementations removed; one tooltip and one
      toast implementation. **Deferred** (large framework consolidation).
- [~] Modal frames use `--shadow-modal`, popovers `--shadow-popover`. **Done** on the touched frames;
      app-wide backdrop opacity/blur + radius/max-width scale **deferred**.

## Tests

- [x] Behaviour tests on the migrated dialog: Escape closes + `role="dialog"` exposed
      (`SplitStoryPicker.test.tsx`); the shared `Modal`'s own trap/restore tests still pass.
- [x] Guard test: the migrated overlays reference z-index tokens + dialog semantics, and the named
      inversions stay fixed (`overlay-zindex-guard.test.ts`). (App-wide raw-z guard deferred with the
      broad sweep.)
- [x] Existing command-palette / search / picker tests stay green (7023 pass).

## Related

- [[BRDG-421-converge-buttons-and-menu-items]] — the shared `MenuItem` lives inside these popovers.
- [[BRDG-425-accessibility-baseline-pass]] — combobox/listbox roles for CommandPalette/SearchModal and
  menu roles are tracked there; this story gives them the dialog scaffolding.
- Touch points: `shared/Modal.tsx`, `Popover.tsx`, `BasePicker.tsx`, `Tooltip.tsx`, `ui/Toast.tsx`,
  `StoryWriterLauncherModal.tsx`, `SearchModal.tsx`, `CommandPalette.tsx`, `SprintStatsPopover.tsx`,
  `StakeholderBriefing.tsx`, `FilterBar.tsx`, `globals.css` (z-index + shadow tokens).
