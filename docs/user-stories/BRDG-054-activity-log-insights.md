# BRDG-054: Activity Log Insights

**Status:** Open
**Priority:** Low
**Depends on:** BRDG-089 (Activity Log Coverage) - full value requires story writer and agent events to be logged first

## Description

As the PO, I want the Activity Log to show aggregated stats and highlight recurring failures so I can proactively fix integration issues instead of discovering them after the fact.

## Acceptance Criteria

### Phase 1: Stats header
- [ ] Summary stats bar at the top of the Activity Log page
- [ ] Metrics: total events today, success rate (%), average duration, active error count
- [ ] Each metric shows a delta vs. yesterday (up/down arrow + absolute diff)
- [ ] Stats are computed from all event types, not only Jira syncs

### Phase 2: Failure analysis
- [ ] "Recurring Failures" section below the stats bar
- [ ] Show error types that occurred 3+ times in the last 7 days
- [ ] Group by `type` + normalized `errorDetail` pattern (strip variable parts like ticket keys/timestamps)
- [ ] Per group: count, last occurrence timestamp, list of affected scopes (ticket keys, sprint names)
- [ ] Each group links to the most recent log entry for that failure type
- [ ] Empty state when no recurring failures exist

### Phase 3: Timeline visualization
- [ ] Horizontal timeline showing all events over the last 24 hours
- [ ] One dot per log entry, color-coded: green (success), red (failed), amber (running/cancelled)
- [ ] Dots are clickable - clicking opens the log entry detail
- [ ] Tooltip on hover: timestamp, type, scope, duration
- [ ] Gaps in the timeline are visible as empty space (no fabricated dots)
- [ ] Timeline is read-only (no interaction beyond hover/click)

### Phase 4: Health score
- [ ] Single numeric score (0-100) displayed prominently in the Activity Log header
- [ ] Formula (weighted): success rate 50% + duration consistency 25% + error-free streak 25%
- [ ] Duration consistency: ratio of entries within 2x the median duration for that event type
- [ ] Error-free streak: hours since last failed entry, normalized to 0-100 over a 72h window
- [ ] Color band: green (80-100), amber (50-79), red (0-49)
- [ ] Trend arrow showing direction vs. 7 days ago (up/flat/down)
- [ ] Score tooltip explaining the three components and their current values

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
