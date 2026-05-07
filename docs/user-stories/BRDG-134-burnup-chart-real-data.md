# BRDG-134: Burnup Chart with Real Status Change Data

**Status:** Open
**Priority:** High
**Depends on:** BRDG-132 (Analytics - BV & Burnup Charts, completed)

## Description

As the PO, I want the burnup chart to show real historical data based on when tickets actually moved to DONE, matching the Jira burnup style with step-lines, a guideline, and a scope line. Both Story Points and Business Value should be visible in a single combined chart.

Currently the burnup chart shows a simplified diagonal line from 0 to the current done value. This story replaces it with a proper burnup powered by actual status transition history.

### Visual Design (matching Jira burnup)

Single combined chart with:

1. **Completed SP** (step-line, brand color) - jumps up when stories move to DONE, based on their story points
2. **Completed BV** (step-line, secondary color) - same but tracking cumulative business value of DONE tickets
3. **Guideline** (diagonal, muted) - ideal linear burn rate from 0 to total scope
4. **Work Scope** (step-line, red/muted) - total committed SP, changes when tickets are added/removed from sprint
5. **Today marker** - vertical dashed line; scope line continues as dotted after today

Both SP and BV lines use the same x-axis (sprint timeline) but normalized to percentage of total (0-100%), so they're comparable despite different scales. No numeric y-axis labels needed; the focus is on seeing the shape and relative progress of both lines together.

## Implementation Plan

1. Add `ticket_status_change` table to `src/db/schema.ts`, generate + apply migration
2. Add `getStatusChangelog(key)` to Jira client (same pagination pattern as `getDescriptionChangelog`)
3. Create `POST /api/burnup/seed?sprintId=X` to backfill from Jira changelog
4. Detect status changes during ticket sync and insert rows into `ticket_status_change`
5. Create `GET /api/burnup?sprintId=X` that computes burnup data points from transitions
6. Replace two-chart BurnupChart with single combined chart: step-lines, guideline, scope, today marker
7. Add auto-seed on first view with loading indicator
8. Scope line: flat at current total (historical scope changes are a future enhancement)

## Acceptance Criteria

### Phase 1: Status Change History

- [ ] New `ticket_status_change` table: id, ticket_key, sprint_name, from_status, to_status, changed_at (ISO timestamp), story_points (at time of change), business_value (at time of change)
- [ ] DB migration generated and applied
- [ ] New Jira client method `getStatusChangelog(key)` that fetches status field changes from `/rest/api/3/issue/{key}/changelog` (paginated, same pattern as `getDescriptionChangelog`)
- [ ] New API endpoint `GET /api/burnup?sprintId=X` that returns burnup data points
- [ ] Seed endpoint `POST /api/burnup/seed?sprintId=X` that fetches Jira changelog for all tickets in a sprint and populates the `ticket_status_change` table (backfill)
- [ ] During ticket sync (`sync-tickets`), detect status changes and insert rows into `ticket_status_change`

### Phase 2: Redesigned Burnup Chart

- [ ] Replace current two-chart layout with a single combined burnup chart
- [ ] Step-line rendering for completed work (not smooth/diagonal)
- [ ] SP completed line (brand color) - cumulative SP of tickets in DONE status over time
- [ ] BV completed line (secondary color) - cumulative BV of DONE tickets over time, normalized to same scale
- [ ] Both lines use percentage scale (0-100% of respective totals) so they overlay meaningfully
- [ ] Guideline: straight diagonal from (sprint start, 0) to (sprint end, 100%)
- [ ] Scope line: step-line showing total committed SP over time (changes when tickets join/leave sprint)
- [ ] Today marker: vertical dashed line at current date
- [ ] After today: scope line continues as dotted (projection at current level)
- [ ] Tooltip on hover showing: date, SP done (absolute + %), BV done (absolute + %), scope
- [ ] Chart height ~200px, responsive width
- [ ] Legend showing all lines with labels

### Phase 3: Auto-seed on First View

- [ ] When burnup chart is shown for a sprint with no status change data, automatically trigger a seed in the background
- [ ] Show a subtle loading indicator while seeding ("Loading history...")
- [ ] After seed completes, chart updates with real data
- [ ] Cache/flag per sprint so seed only runs once

## Technical Notes

- Jira changelog API: `GET /rest/api/3/issue/{key}/changelog` returns all field changes. Filter for `field === "status"`. Each entry has `created` (ISO timestamp), `fromString`, `toString`. Existing `getDescriptionChangelog` uses the same endpoint and can serve as a pattern.
- The `ticket_status_change` table only needs to store transitions, not full snapshots. The burnup API endpoint reconstructs the cumulative chart data from the transitions.
- For scope line: track when tickets enter/leave the sprint by looking at `Sprint` field changes in the changelog, or approximate from the ticket's `jira_updated_at` vs sprint start date.
- BV normalization: `(cumulative_bv_done / total_bv) * 100` gives percentage. SP normalization: `(cumulative_sp_done / total_sp) * 100`. Both plotted on the same 0-100% y-axis.
- Keep the BV by status / BV by assignee bar charts from BRDG-132 as-is. Only the burnup chart changes.
- Pure SVG rendering, no external charting library.

## Out of Scope

- Cross-sprint velocity/burnup comparison
- Burndown chart (inverse)
- Predicted completion trendlines
- Exporting charts
