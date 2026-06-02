# BRDG-240: Recognizable Visual Distinction for SP and BV

**Status:** Done
**Priority:** Low
**Type:** Enhancement

## Chosen direction (B — icon + color)

Decided via the throwaway preview page `src/app/(app)/dev/sp-bv-styles/page.tsx` (not linked from navigation; excluded from `routes.test.tsx`; safe to delete now the treatment is shipped).

- **SP** uses a leading **gauge** icon (effort/complexity); **BV** uses a leading **goal** icon (value/target).
- **Subtle (dense table):** icon + number, no background. **Tinted (emphasis):** icon + number on a tinted pill — hover card, refinement session header, ticket sidebar, and the sprint-board header total pills.
- The `SP / BV / #` switcher keeps its text labels (a word reads clearer than an icon on a control).
- **Color:** SP is neutral grey in the dense table and a green ramp only when tinted. BV is neutral grey at 1-2 and a warm amber → orange ramp at 3-7.
- The styled `Tooltip` (not the native `title`) labels the SP/BV cells on hover.
- The display treatment is a single reusable component, `src/components/shared/MetricBadge.tsx` (gauge/goal icon + value + the color rules + optional `tinted`/`tooltip`). It is used by the multiselect bulk bar, the sprint-board header total pills, the read-only hover card, and the refinement ticket/queue lists. The editable cells use `StoryPointPicker` / `BusinessValuePicker` (which share the same icon + color treatment via `showMetricIcon`).

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

## Constraints (met)

- Must work in the dense Sprint Board table without making rows noticeably taller or columns much wider.
- Must remain inline-editable (the cell is a picker trigger, not just a display badge).
- Must stay legible at the current small font size and respect the existing design tokens / color system (no default Tailwind palette).
- Should stay consistent with how SP/BV appear elsewhere (side panel, refinement, ticket sidebar), or at least not contradict them.

## Requirements

- SP/BV cells in the sprint-board table are distinguishable without the column header (gauge vs goal icon).
- The treatment is applied consistently across the table and the emphasis spots (hover card, refinement header, sidebar, header total pills).
- N/A (0 → "-") and unset (dot) states remain clearly readable.
- Sorting and inline editing behavior are unchanged.
- A styled tooltip replaces the native `title` on the table cells.

## Out of scope

- Changing the SP/BV value *scales* (still 1/2/3/5/8 and 1-7). The color *bands* in `getSpColor` / `getBvColor` were re-tuned as part of this story (SP → green ramp; BV → grey at 1-2, amber/orange at 3-7).
- Reworking the pickers' popover/edit UI.
- Changing where SP/BV appear (column placement is BRDG-238/239 territory).

## Technical notes

- Table cells: `src/components/sprint-board/TicketRow.tsx` (`points` case ~L419 and `bv` case ~L477) render `StoryPointPicker` / `BusinessValuePicker` with `subtle`.
- Headers / labels: `src/components/sprint-board/TicketTable.tsx` (`HEADER_LABELS`, `HEADER_TOOLTIPS`).
- Pickers: `src/components/shared/StoryPointPicker.tsx` and `src/components/shared/BusinessValuePicker.tsx`. The `lg` size already renders an uppercase `SP` / `BV` label prefix (e.g. StoryPointPicker L114, BusinessValuePicker L62) - reuse this for the label-prefix direction.
- Colors: `SP_COLORS` / `getSpColor` and `BV_COLORS` / `getBvColor` in `src/types/ticket.ts` (SP = green→orange band, BV = blue/gold band).
- Other render sites to keep consistent: `SidePanel.tsx`, refinement (`SessionStoryPointPicker.tsx`, `SessionTicketView.tsx`), `TicketSidebar.tsx`, `MetaApp.tsx`.

## Checklist

- [x] Decide the visual direction (chose B — icon + color: gauge for SP, goal for BV)
- [x] Implement the icon treatment in the compact picker(s) via a `showMetricIcon` prop (table cells)
- [x] Apply the tinted icon variant to emphasis spots (hover card, refinement header, sidebar, header total pills)
- [x] Re-tune colors: SP neutral/green-when-tinted; BV grey at 1-2, amber/orange at 3-7
- [x] Add a styled `Tooltip` (`richTooltip`) to the table cells, replacing the native title
- [x] Verify N/A and unset states remain readable
- [x] Verify inline editing and sorting are unchanged
- [x] Add/extend tests for the new rendering (`showMetricIcon`, `richTooltip`, lg icon)
- [x] Verify visually in the Sprint Board table (BT: 137 / BT: 138)
- [x] Delete the preview page `dev/sp-bv-styles` once the treatment is signed off (moved to `deleted/`)
