# BRDG-428: Make the z-index token scale authoritative on all anchored overlays

**Status:** Done (2026-07-03, branch ui-wave-427-431)
**Priority:** Medium
**Type:** Consistency — layering / z-index (follow-up of BRDG-422)

## Description

BRDG-422 fixed the z-index *inversions* that caused visible bugs (command palette no
longer paints above dialogs; toasts on the `z-notification` layer; stakeholder drawer
and SprintStatsPopover on `z-modal`; the shared `Popover` on `z-dropdown`). It
deliberately deferred the **broad sweep**: ~44 hardcoded `z-50` and ~15
`z-[9999]`/`zIndex:9999` still sit on anchored dropdowns and pickers, so the four
z-index tokens (`z-dropdown:50` < `z-modal:60` < `z-tooltip:70` < `z-notification:80`)
are not yet the single source for layering.

## Evidence (file:line)

- `z-[9999]` / `zIndex:9999` on portal pickers/floats: `shared/BasePicker.tsx`,
  `shared/EstimatePicker.tsx`, `shared/StoryPointPicker.tsx`, `shared/BusinessValuePicker.tsx`,
  `shared/DateTimePicker.tsx`, `shared/Tooltip.tsx`, `shared/TicketStatusPill.tsx`
  (the `DropdownPortal` + hover card), `sprint-board/RefinementGemHoverCard.tsx`,
  `sprint-board/OpenSubtasksIndicator.tsx`, `sprint-board/ticket-action-menu.tsx`
  (`AnchoredMenu`/`CursorMenu`), `sprint-board/SprintDetailsPopover.tsx`,
  `sprint-board/SprintListModal.tsx`, `ticket-detail/ChildIssueComposer.tsx`,
  `epics/EpicTeamPicker.tsx`, `epics/EpicColorPicker.tsx`.
- ~44 hardcoded `z-50` on per-file `absolute`/portal dropdowns.
- Off-scale `z-[100]` (`RefinementSessionMenu.tsx`).

## Proposed approach

1. **CRITICAL caveat first.** Many pickers use `z-[9999]` *on purpose*: when opened from
   inside a modal (`z-modal` 60) they must float **above** it. Mapping them naively to
   `z-dropdown` (50, below modal) would hide them. Decide the rule before sweeping:
   - portal pickers that can open inside a modal → `z-tooltip` (70, above modal), OR
   - introduce a dedicated "popover-above-modal" layer.
   Plain page-level dropdowns that never open inside a modal → `z-dropdown` (50).
2. Replace every hardcoded `z-50`/`z-[9999]`/`z-[100]` on overlays with the chosen token.
3. Verify in Chrome that pickers opened **from inside a modal** still render above it
   (StoryPoint/BusinessValue/Epic/Assignee pickers from the ticket sidebar + any modal).

### Trade-offs
- Value-preserving but broad; the risk is layering regressions, not behaviour. Do it as one
  slice, verify the picker-inside-modal cases explicitly.

## Acceptance Criteria

- [x] No hardcoded `z-50`/`z-[9999]`/`zIndex:9999`/`z-[100]` on overlays; all use the five tokens.
- [x] Pickers opened from inside a modal still float above it (verified in both themes).
- [x] Guard test: overlay files reference only the z-index tokens, not raw `z-[number]`/`z-50`.

## Tests

- [x] Extend `overlay-zindex-guard.test.ts` to assert no raw overlay z values remain (drop the
      "broad sweep deferred" exemption).
- [x] Existing picker/menu tests stay green.

## Implementation notes (2026-07-03)

The scale gained a fifth token in [[BRDG-429-converge-anchored-floating-panels]]:
`dropdown 50 < modal 60 < popover 65 < tooltip 70 < notification 80`. Assignment
rule applied in the sweep:
- page-level dropdown panels -> `z-dropdown` (52 `z-50` call sites; value-identical swap)
- interactive portal panels that may open inside a modal (pickers, action menus,
  DateTimePicker calendar, SprintDetailsPopover, SprintListModal portal branch,
  OpenSubtasksIndicator, ConversationList/RefinementSession menus,
  UserProfilePopover) -> `z-popover`
- hover cards + Tooltip (TicketStatusPill hover card, RefinementGemHoverCard) -> `z-tooltip`
- toasts (ExportToasts was on `z-50`, refinement copy-toast) -> `z-notification`

Judgment calls:
- FocusModeWrapper: corner exit button `z-[100]` -> `z-dropdown`; skip link
  `focus:z-[200]` -> `focus:z-notification` (must beat every overlay when focused).
- The last two z-40-catcher dropdowns (pipelines DeploySettings, EpicFilterBar)
  were migrated onto the shared `Popover` instead of only re-tokening them.
- Deliberately left BELOW the token scale: ChatLayout mobile drawer (`z-40`) and
  InboxDigestBanner (`z-40`) — layout layers that must not cover overlays; plus
  local stacking (`zIndex: 1/5`, `z-20/z-30`) that is not overlay layering.
- Browser-verified: DateTimePicker calendar opened from inside Sprint Edit modal
  floats above it (both themes); tooltips paint above open pickers; toasts above all.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent (inversions fixed there).
- [[BRDG-429-converge-anchored-floating-panels]] — the same anchored panels get one primitive.
