# BRDG-428: Make the z-index token scale authoritative on all anchored overlays

**Status:** Not Started
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

- [ ] No hardcoded `z-50`/`z-[9999]`/`zIndex:9999`/`z-[100]` on overlays; all use the four tokens.
- [ ] Pickers opened from inside a modal still float above it (verified in both themes).
- [ ] Guard test: overlay files reference only the z-index tokens, not raw `z-[number]`/`z-50`.

## Tests

- [ ] Extend `overlay-zindex-guard.test.ts` to assert no raw overlay z values remain (drop the
      "broad sweep deferred" exemption).
- [ ] Existing picker/menu tests stay green.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent (inversions fixed there).
- [[BRDG-429-converge-anchored-floating-panels]] — the same anchored panels get one primitive.
