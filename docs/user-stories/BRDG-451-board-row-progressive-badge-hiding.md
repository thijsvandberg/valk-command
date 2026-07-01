# BRDG-451: Progressively hide board row badges when the list column is narrow

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
When the Sprint Board list column gets narrow (side panel open, or a wide detail panel), the inline metadata badges on the right of each row no longer fit. The title truncates to almost nothing and the badges crowd together / overflow, making rows hard to scan.

The row should degrade gracefully: as the column narrows, the at-a-glance badges drop out one by one in a fixed priority order instead of all fighting for the same shrinking space. Hidden badges simply disappear (no overflow chip, no extra affordance) - the full metadata is always available in the detail panel.

**Decided with PO:**
- Behaviour: **just hide** the badge below a width threshold (same mechanism the warning badges already use). No collapse-into-"…" chip.
- Hide order (first to drop -> last to survive): **Refinement badge -> Business Value (BV) -> Story Points (SP) -> Epic.** Epic (grouping context) stays visible longest.

## Current Behaviour
All row rendering lives in `src/components/sprint-board/BoardRow.tsx`. The row wrapper already declares a container-query context: `group/row @container/boardrow ...` (`BoardRow.tsx:487`), so width-based rules can be expressed relative to the row's own width.

Today only the **warning badges** actually hide when narrow. They use display-gating (not opacity), so a narrow row reserves no space for them (`BoardRow.tsx:754-766`):

```
<span className="hidden shrink-0 items-center gap-1.5 @[52rem]/boardrow:inline-flex">
```

The badges the PO wants managed do **not** hide - they only shrink/truncate, so they keep occupying space and force the title to collapse or overflow:
- **Refinement badge** (`Boxes` icon in `RefinementGemTrigger`): `inline-flex h-5 shrink-0 ...` - never yields space (`BoardRow.tsx:774-789`).
- **Epic chip** (`EpicPicker` / `EpicBadge`): `min-w-0 shrink` - compresses but never disappears (`BoardRow.tsx:808-823`).
- **SP value** (`EstimatePicker`, dense): wrapped in `shrink-0` (`BoardRow.tsx:860-874`).
- **BV value** (`BusinessValuePicker`, dense): wrapped in `shrink-0` (`BoardRow.tsx:875-886`).

Empty planning cells already hide when narrow via `HoverRevealSlot hideWhenNarrow` (`src/components/shared/HoverRevealSlot.tsx`, gated `@[45rem]/boardrow:group-hover/row:inline-flex`), but that only covers the *unset* placeholders, not the *set* value badges above.

List width itself is not a drag-resizable split pane: the list is `flex-1` and the detail `SidePanel` has a device-local width in `localStorage` (`sprintBoardPanelWidth`, default 400 / min 320; see `src/components/sprint-board/SidePanel.tsx`). So the row narrows purely as a function of panel width and viewport - container queries on the row are the right tool.

## Proposed Approach
Reuse the existing warning-badge pattern (`hidden ... @[Xrem]/boardrow:inline-flex`) and apply **staggered** breakpoints to the four target badges so they drop in the agreed order. Larger breakpoint = drops earlier (needs more width to stay).

Wrap each target badge's outer `<span>` with a `hidden`/`@[Xrem]/boardrow:inline-flex` (or `:flex` for the epic wrapper) toggle. Suggested starting thresholds (tunable during implementation with visual verification - the exact rem values must be dialled in against a real narrow column, not guessed):

| Badge | Drops below (approx) | Where |
|-------|----------------------|-------|
| Refinement (`Boxes`) | ~40rem | `BoardRow.tsx:774-789` |
| BV value | ~34rem | `BoardRow.tsx:875-886` |
| SP value | ~30rem | `BoardRow.tsx:860-874` |
| Epic chip | ~26rem | `BoardRow.tsx:808-823` |

Notes:
- Use **display gating** (`hidden` + `@[Xrem]/boardrow:inline-flex`), consistent with the warning badges, so a hidden badge reserves no space and never leaves a gap. Do not use opacity.
- Keep the container-query anchor on the existing `@container/boardrow` (`BoardRow.tsx:487`); no new container needed.
- The epic chip currently keeps `min-w-0 shrink` for graceful compression *above* its breakpoint; keep that so it truncates before it finally hides.
- Interactive pickers (Estimate/BV/Epic) already stop row-selection via `onPointerDown/onClick stopPropagation`; wrapping their span with the visibility toggle does not change that.

### Out of scope / non-goals
- **Selection checkbox / "checkmark"**: the checkbox only appears on hover or during multiselect (`BoardRow.tsx:411-416`); it is a core interaction control and must NOT be width-hidden. The leftmost issue-type/status icon also stays. (If the PO meant a different "checkmark", see Open Questions.)
- **Assignee avatar, flag, quality score, notes, sprint, reporter chips**: not in this story's set; leave their current behaviour untouched.
- No overflow "…" chip or expand-on-hover affordance (explicitly rejected in favour of plain hiding).
- No change to how the list/panel width is computed.

## Open Questions
- **What exactly is "checkmark"?** The PO's list said "SP/BV/Epic/checkmark/refinement badge". Interpreted here as the hover/multiselect **selection checkbox**, which we deliberately keep visible (hiding a selection control by width would break multiselect). Default: leave selection out of the hide set. If the PO instead meant a status/type icon (e.g. the done-checkmark seen on some rows), that is a different, essential icon and should also stay - so the default answer is the same either way, but flag for confirmation.
- **Exact rem breakpoints.** The table above is a starting point; final thresholds should be tuned visually so badges drop just before they would overflow, not prematurely. Default: dial in during implementation against the real narrow-column layout.

## Acceptance Criteria
- [ ] When the list column is wide, all four badges (refinement, BV, SP, epic) render exactly as today. <!-- BoardRow.tsx:774-886, above their breakpoints -->
- [ ] As the column narrows, badges hide in order: refinement first, then BV, then SP, then epic last. <!-- staggered @[Xrem]/boardrow:inline-flex on each badge span -->
- [ ] A hidden badge reserves no horizontal space (title reclaims it); no empty gap is left where a badge was. <!-- display gating via `hidden`, not opacity -->
- [ ] The title (`min-w-0 flex-1 truncate`) still yields space first and truncates before badges start dropping. <!-- BoardRow.tsx:676-706 -->
- [ ] The selection checkbox and leftmost type/status icon remain visible regardless of column width. <!-- BoardRow.tsx:411-416 unchanged -->
- [ ] Warning badges keep their existing ~52rem hide behaviour, unchanged. <!-- BoardRow.tsx:754-766 -->

## Tests
- [ ] Render `BoardRow` in a narrow container and assert the target badge spans carry the `hidden` + container-query visibility classes in the correct staggered order. <!-- src/components/sprint-board/BoardRow.test.tsx -->
- [ ] Assert a set SP/BV/epic/refinement badge still renders (in DOM) at wide width and that the selection checkbox is never gated by a width class. <!-- src/components/sprint-board/BoardRow.test.tsx -->

## Related
- [[BRDG-366-board-warning-badges-interactive]] - established the `hidden ... @[52rem]/boardrow:inline-flex` display-gating pattern this story reuses.
- [[BRDG-310-empty-sp-bv-hover-reveal]] - set SP/BV values render inline; empty cells use `HoverRevealSlot hideWhenNarrow`.
- `src/components/shared/HoverRevealSlot.tsx` - existing narrow-hide helper for unset placeholders.
- [[project_row_marker_family]] - the refinement/SP/BV marker design these badges use.
