# BRDG-240: Recognizable Visual Distinction for SP and BV

**Status:** Draft (design direction not yet chosen)
**Priority:** Low
**Type:** Enhancement

## Description

As a PO, I want the Story Points (SP) and Business Value (BV) values in the Sprint Board ticket table to be instantly recognizable as SP or BV, so that I can tell which metric I'm looking at without having to read the column header.

Today both columns render as bare colored numbers (see screenshot below). The color already varies by value, but nothing in the cell itself signals *which* metric it is. When scanning a row you have to map back to the `SP` / `BV` column headers to know what a number means. The goal is to make SP vs BV self-evident at a glance.

```
        SP  ↑↓        BV
        ─────────────────
         3             2
       (green)      (blue/gold)
```

There is already a precedent worth reusing: the large (`lg`) variant of both pickers renders a small uppercase `SP` / `BV` text label in front of the number. The compact (`subtle` / `sm`) variant used in the table does not.

## Open design direction (to be decided)

This story intentionally leaves the visual approach open. Pick one (or a hybrid) before implementation:

1. **Label-prefix pill** - each cell becomes a compact pill with an `SP` / `BV` text label plus the number, keeping the existing per-value color. Most explicit, reuses the existing `lg` picker pattern, slightly wider.
2. **Icon + color** - a small leading icon per metric (e.g. an effort/gauge icon for SP, a star for BV) plus the existing color. Compact and low-noise, but the icon meaning has to be learned.
3. **Combined badge** - SP and BV merged into a single badge where order + color carries the meaning (SP left/green, BV right/gold). Saves a column, but is the least explicit.
4. **Color-identity only** - no label or icon, but two clearly distinct fixed color families per metric (SP green→orange, BV blue→gold) plus a subtle shape difference. Smallest change, leans entirely on color.

Constraints that apply to any chosen direction:

- Must work in the dense Sprint Board table without making rows noticeably taller or columns much wider.
- Must remain inline-editable (the cell is a picker trigger, not just a display badge).
- Must stay legible at the current small font size and respect the existing design tokens / color system (no default Tailwind palette).
- Should stay consistent with how SP/BV appear elsewhere (side panel, refinement, ticket sidebar), or at least not contradict them.

## Requirements

> Finalize once a direction is chosen. Skeleton:

- The Sprint Board ticket table must visually distinguish SP cells from BV cells without relying on the column header.
- The distinction must be applied consistently to every SP/BV cell in the table.
- Empty / not-applicable (N/A) and unset states must remain clearly readable under the new treatment.
- Sorting and inline editing behavior must be unchanged.

## Out of scope

- Changing the SP/BV value scales, color bands, or the `getSpColor` / `getBvColor` logic itself.
- Reworking the pickers' popover/edit UI.
- Changing where SP/BV appear (column placement is BRDG-238/239 territory).

## Technical notes

- Table cells: `src/components/sprint-board/TicketRow.tsx` (`points` case ~L419 and `bv` case ~L477) render `StoryPointPicker` / `BusinessValuePicker` with `subtle`.
- Headers / labels: `src/components/sprint-board/TicketTable.tsx` (`HEADER_LABELS`, `HEADER_TOOLTIPS`).
- Pickers: `src/components/shared/StoryPointPicker.tsx` and `src/components/shared/BusinessValuePicker.tsx`. The `lg` size already renders an uppercase `SP` / `BV` label prefix (e.g. StoryPointPicker L114, BusinessValuePicker L62) - reuse this for the label-prefix direction.
- Colors: `SP_COLORS` / `getSpColor` and `BV_COLORS` / `getBvColor` in `src/types/ticket.ts` (SP = green→orange band, BV = blue/gold band).
- Other render sites to keep consistent: `SidePanel.tsx`, refinement (`SessionStoryPointPicker.tsx`, `SessionTicketView.tsx`), `TicketSidebar.tsx`, `MetaApp.tsx`.

## Checklist

- [ ] Decide the visual direction (label / icon / combined / color-only) and finalize Requirements
- [ ] Implement the chosen treatment in the compact picker(s)
- [ ] Verify N/A and unset states remain readable
- [ ] Verify inline editing and sorting are unchanged
- [ ] Check consistency with side panel / refinement / ticket sidebar render sites
- [ ] Add/extend tests for the new rendering
- [ ] Verify visually in the Sprint Board table
