# BRDG-054: Activity Log Insights

**Status:** Completed
**Priority:** Low
**Depends on:** BRDG-089 (Activity Log Coverage) - full value requires story writer and agent events to be logged first

## Description

As the PO, I want the Activity Log to show aggregated stats and highlight recurring failures so I can proactively fix integration issues instead of discovering them after the fact.

## Implementation Plan

1. **Types** (`src/types/ticket.ts`): Add `ActivityLogDayStats`, `RecurringFailure`, `TimelineEntry`, `HealthScore`, `ActivityLogStats`, `ActivityLogStatsResponse` interfaces.
2. **Backend compute utilities** (`src/app/api/activity-log/compute-stats.ts`): Pure functions for `computeDayStats`, `computeRecurringFailures`, `normalizeErrorDetail`, `computeHealthScore`, `computeTimeline`.
3. **Backend API extension** (`src/app/api/activity-log/route.ts`): When `?include=stats`, return `{ entries, stats }`. When absent, return plain array (backward compat preserved).
4. **Backend tests** (`route.test.ts` + new `compute-stats.test.ts`): Cover stats shape, formulas, normalization, edge cases.
5. **Stats bar** (inline in `page.tsx` or `StatsBar` component): 4 metric cards with delta arrows, rendered above filters.
6. **Recurring Failures section**: Group + filter failed entries, rendered below stats bar.
7. **Timeline** (`EventTimeline` component or inline): positioned-div row, color-coded dots, hover tooltip, click-to-expand.
8. **Health score**: Numeric badge in/near ViewHeader, color band, trend arrow, tooltip with component breakdown.
9. **Page layout integration**: Assemble all sections in order above the existing filter/table.

Dependencies: Types -> Backend -> Frontend sections (3-7 independent) -> Layout integration.

Key decisions:
- Stats call is a separate SWR key (`?include=stats`) from the filtered/paginated list call -- no backward compat breakage.
- "Active error count" = `status=failed AND acknowledged=false` for today.
- Timeline dot click clears filters, resets offset, adds entry ID to `expandedIds`.

## Acceptance Criteria

### Phase 1: Stats header
- [x] Summary stats bar at the top of the Activity Log page
- [x] Metrics: total events today, success rate (%), average duration, active error count
- [x] Each metric shows a delta vs. yesterday (up/down arrow + absolute diff)
- [x] Stats are computed from all event types, not only Jira syncs

### Phase 2: Failure analysis
- [x] "Recurring Failures" section below the stats bar
- [x] Show error types that occurred 3+ times in the last 7 days
- [x] Group by `type` + normalized `errorDetail` pattern (strip variable parts like ticket keys/timestamps)
- [x] Per group: count, last occurrence timestamp, list of affected scopes (ticket keys, sprint names)
- [x] Each group links to the most recent log entry for that failure type
- [x] Empty state when no recurring failures exist

### Phase 3: Timeline visualization
- [x] Horizontal timeline showing all events over the last 24 hours
- [x] One dot per log entry, color-coded: green (success), red (failed), amber (running/cancelled)
- [x] Dots are clickable - clicking opens the log entry detail
- [x] Tooltip on hover: timestamp, type, scope, duration
- [x] Gaps in the timeline are visible as empty space (no fabricated dots)
- [x] Timeline is read-only (no interaction beyond hover/click)

### Phase 4: Health score
- [x] Single numeric score (0-100) displayed prominently in the Activity Log header
- [x] Formula (weighted): success rate 50% + duration consistency 25% + error-free streak 25%
- [x] Duration consistency: ratio of entries within 2x the median duration for that event type
- [x] Error-free streak: hours since last failed entry, normalized to 0-100 over a 72h window
- [x] Color band: green (80-100), amber (50-79), red (0-49)
- [x] Trend arrow showing direction vs. 7 days ago (up/flat/down)
- [x] Score tooltip explaining the three components and their current values

## Technical Notes

- All data derived from existing `activityLog` table - no new tables required
- Stats query: `SELECT type, status, COUNT(*), AVG(durationMs) FROM activityLog WHERE startedAt >= ? GROUP BY type, status`
- Yesterday comparison: run the same query with a 24h-shifted window; compute deltas in application code
- Failure grouping: strip variable tokens from `errorDetail` with a short regex list (e.g. `/[A-Z]+-\d+/g` for ticket keys)
- Health score: compute on page load; no need to cache unless query time exceeds 200ms in practice
- Timeline: render as an SVG or a positioned div row; do not use a charting library - keep it lightweight
- Do not add a new API route for stats; extend the existing `/api/activity-log` GET with an `?include=stats` query param that returns an additional `stats` object alongside the log entries

## Out of Scope
- Alerting on health score drops (BRDG-041)
- Detailed per-entry performance profiling
- Log export/download
- Custom date range for analytics
- Per-user breakdown (single-user app)
