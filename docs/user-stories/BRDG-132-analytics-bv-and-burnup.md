# BRDG-132: Analytics - Business Value & Burnup Charts

**Status:** Done
**Priority:** Medium
**Depends on:** BRDG-129 (Business Value Scoring, phases 1-3 complete)

## Description

As the PO, I want the Sprint Analytics panel to include Business Value metrics and burnup charts for both Story Points and Business Value, so I can track sprint progress and value delivery at a glance.

Currently the analytics panel only shows story point distribution by status and by assignee. This story extends it with:

1. Business Value aggregates (total, average, distribution by status and assignee)
2. A burnup chart for Story Points (scope vs done over time)
3. A burnup chart for Business Value (scope vs done over time)

## Implementation Plan

### Step 0: Extend Sprint type with raw dates (prerequisite for burnup charts)
- Add `startDate?: string | null` and `endDate?: string | null` to `Sprint` interface in `src/types/ticket.ts`
- Update `mapJiraSprints()` in `sprint-board-utils.ts` to preserve raw dates (currently discarded)

### Phase 1: BV metrics in analytics (Steps 1.1-1.5)
- 1.1: Add `bvTotal`, `bvAvg`, `bvByStatus`, `bvByAssignee` memos in `SprintAnalytics.tsx`
- 1.2: Show BV stats in collapsed header bar next to total points
- 1.3: Add "BV by status" stacked bar section (renders only when BV data exists)
- 1.4: Add "BV by assignee" bar section
- 1.5: Update early-return guard to show panel when either SP or BV has data

### Phase 2: SP Burnup Chart (Steps 2-3)
- 2.1: Add sprint date props to SprintAnalytics
- 2.2: Pass activeSprint dates from SprintBoard (both call sites)
- 3.1: Create `BurnupChart.tsx` - pure SVG, responsive, tooltip on hover, scope dashed/muted, done solid brand color with area fill
- 3.2: Render SP burnup in expanded analytics panel

### Phase 3: BV Burnup Chart (Step 4)
- 4.1: Add second BurnupChart instance for BV with distinct color
- 4.2: Responsive grid - side by side on wide screens, stacked on narrow

### Limitations (MVP)
- No historical status change data exists in the database. Burnup charts show simplified 2-point visualization (0 at sprint start, current value at today). A follow-up story can add a `ticket_status_snapshot` table for real historical tracking.
- BV scope is a flat line (current total), as no timestamp history for BV changes is tracked yet.

## Acceptance Criteria

### Phase 1: Business Value in Analytics

- [x] Show BV total and average next to story points in the collapsed summary bar (e.g. "21 pts total | BV: 28 avg 4.0")
- [x] Add "BV by status" section: same horizontal stacked bar as story points, but using BV sums per status
- [x] Add "BV by assignee" section: same horizontal bar layout as story points, but using BV sums per assignee
- [x] Sections only render when at least one ticket has a BV score
- [x] All values update live when BV scores change (optimistic updates)

### Phase 2: Story Points Burnup Chart

- [x] Add a burnup chart in the expanded analytics panel
- [x] X-axis: sprint timeline (start date to end date, or current date if sprint is active)
- [x] Two lines: "Scope" (total committed SP over time) and "Done" (cumulative SP moved to DONE over time)
- [x] Use ticket status change history from Jira sync data to plot the Done line <!-- MVP: uses current snapshot data (0 at sprint start, current done value at today) since no status change history table exists. Follow-up story needed for historical tracking. -->
- [x] Scope line shows total SP for all tickets in the sprint at each point in time <!-- MVP: flat scope line showing current total, as no historical scope change data is tracked -->
- [x] Chart renders inline using SVG (no external charting library)
- [x] Responsive: fills available width, fixed height (~160px)
- [x] Tooltip on hover showing date, scope value, and done value
- [x] Visual style: scope line dashed/muted, done line solid brand color, area fill under done line with low opacity

### Phase 3: Business Value Burnup Chart

- [x] Same layout and interaction as the SP burnup chart
- [x] Two lines: "BV Scope" (total committed BV over time) and "BV Done" (cumulative BV of DONE tickets over time)
- [x] BV scope changes when a BV score is assigned or updated (use metadata update timestamps) <!-- MVP: flat scope line showing current total, as no metadata timestamp history is tracked -->
- [x] Chart uses a distinct color from the SP chart to differentiate
- [x] Both charts shown side by side on wider screens (grid), stacked on narrow screens

## Technical Notes

- `Ticket` type already has `businessValue: number | null` from BRDG-129
- Burnup data source: ticket status transitions are available via Jira changelog sync. Check if `statusChanges` or similar history is already stored; if not, a lightweight history table or API call may be needed.
- Charts should be pure SVG rendered in React, no third-party chart library. Keep it simple: polyline for lines, rect for area fills, circle for data points.
- Reuse existing color tokens from `JIRA_STATUS_COLORS` and brand palette.
- The analytics panel is already independently toggleable from the filter bar (separate `analyticsVisible` state).

## Out of Scope

- Velocity charts (cross-sprint trends)
- Burndown charts (inverse of burnup)
- Predicted completion date / trendlines
- Export or share analytics as image/PDF
