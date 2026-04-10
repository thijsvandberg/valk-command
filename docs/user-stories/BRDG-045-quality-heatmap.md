# BRDG-045: Quality Heatmap

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a heatmap view of sprint tickets colored by quality score so I can visually identify which stories need attention before refinement.

## Acceptance Criteria

### Phase 1: Heatmap grid
- [ ] New view mode toggle on Sprint Board (Table / Heatmap)
- [ ] Grid of ticket cards, each sized uniformly
- [ ] Each card shows: ticket key, title (truncated), quality score number
- [ ] Background color based on quality score: red (0-40), amber (41-70), green (71-100), gray (no score)

### Phase 2: Interactive features
- [ ] Hover shows full title and score breakdown tooltip
- [ ] Click opens the ticket side panel (reuse Sprint Board side panel)
- [ ] Filter by epic, assignee, or status (reuse existing filter bar)
- [ ] Sort options: by score ascending (worst first), by key, by epic

### Phase 3: Sprint comparison
- [ ] Dropdown to select a second sprint for comparison
- [ ] Side-by-side heatmaps showing quality distribution
- [ ] Summary stats: average score, tickets below threshold, improvement count

## Technical Notes

- Quality scores come from `ticket_metadata.qualityScore`
- Color interpolation: use HSL color space (hue 0=red to 120=green)
- Responsive grid: auto-fill with min 120px card width
- Reuse existing Sprint Board data fetching; just change the rendering

## Out of Scope (for now)
- Quality score auto-calculation (requires workspace agent)
- Historical heatmap animation over time
- Team-level quality dashboards
- Export heatmap as image
