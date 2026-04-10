# BRDG-054: Activity Log Insights

**Status:** Open
**Priority:** Low

## Description

As the PO, I want the Activity Log to show aggregated stats and highlight recurring failures so I can proactively fix integration issues instead of discovering them after the fact.

## Acceptance Criteria

### Phase 1: Stats header
- [ ] Summary stats bar at the top of the Activity Log page
- [ ] Metrics: total syncs today, success rate (%), average sync duration, active errors count
- [ ] Comparison with yesterday (up/down arrows)

### Phase 2: Failure analysis
- [ ] "Recurring Failures" section highlighting error types that occurred 3+ times in last 7 days
- [ ] Group by error type/message pattern
- [ ] Show count, last occurrence, affected tickets
- [ ] Link to most recent log entry for each failure type

### Phase 3: Timeline visualization
- [ ] Simple activity timeline showing sync events over the last 24 hours
- [ ] Color-coded dots: green (success), red (failure), amber (partial)
- [ ] Hover for details (timestamp, type, duration)
- [ ] Gaps in the timeline indicate periods of no sync activity

### Phase 4: Health score
- [ ] Overall integration health score (0-100) based on: sync success rate, average duration, error recency
- [ ] Displayed prominently in the Activity Log header
- [ ] Color-coded: green (80+), amber (50-79), red (below 50)
- [ ] Trend arrow showing direction over last 7 days

## Technical Notes

- All data derived from existing `activityLog` table
- Aggregation queries with GROUP BY on date/type/status
- Health score formula: weighted average of success rate (50%), duration consistency (25%), error-free streak (25%)
- Consider caching aggregations for the last 7 days (recompute on new log entry)

## Out of Scope (for now)
- Alerting on health score drops (covered by BRDG-041)
- Detailed sync performance profiling
- Log export/download
- Custom date range for analytics
