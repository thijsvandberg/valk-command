# BRDG-132: Analytics - Business Value & Burnup Charts

**Status:** Open
**Priority:** Medium
**Depends on:** BRDG-129 (Business Value Scoring, phases 1-3 complete)

## Description

As the PO, I want the Sprint Analytics panel to include Business Value metrics and burnup charts for both Story Points and Business Value, so I can track sprint progress and value delivery at a glance.

Currently the analytics panel only shows story point distribution by status and by assignee. This story extends it with:

1. Business Value aggregates (total, average, distribution by status and assignee)
2. A burnup chart for Story Points (scope vs done over time)
3. A burnup chart for Business Value (scope vs done over time)

## Acceptance Criteria

### Phase 1: Business Value in Analytics

- [ ] Show BV total and average next to story points in the collapsed summary bar (e.g. "21 pts total | BV: 28 avg 4.0")
- [ ] Add "BV by status" section: same horizontal stacked bar as story points, but using BV sums per status
- [ ] Add "BV by assignee" section: same horizontal bar layout as story points, but using BV sums per assignee
- [ ] Sections only render when at least one ticket has a BV score
- [ ] All values update live when BV scores change (optimistic updates)

### Phase 2: Story Points Burnup Chart

- [ ] Add a burnup chart in the expanded analytics panel
- [ ] X-axis: sprint timeline (start date to end date, or current date if sprint is active)
- [ ] Two lines: "Scope" (total committed SP over time) and "Done" (cumulative SP moved to DONE over time)
- [ ] Use ticket status change history from Jira sync data to plot the Done line
- [ ] Scope line shows total SP for all tickets in the sprint at each point in time
- [ ] Chart renders inline using SVG (no external charting library)
- [ ] Responsive: fills available width, fixed height (~160px)
- [ ] Tooltip on hover showing date, scope value, and done value
- [ ] Visual style: scope line dashed/muted, done line solid brand color, area fill under done line with low opacity

### Phase 3: Business Value Burnup Chart

- [ ] Same layout and interaction as the SP burnup chart
- [ ] Two lines: "BV Scope" (total committed BV over time) and "BV Done" (cumulative BV of DONE tickets over time)
- [ ] BV scope changes when a BV score is assigned or updated (use metadata update timestamps)
- [ ] Chart uses a distinct color from the SP chart to differentiate
- [ ] Both charts shown side by side on wider screens (grid), stacked on narrow screens

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
