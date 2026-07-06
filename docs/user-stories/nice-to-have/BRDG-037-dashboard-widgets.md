# BRDG-037: Dashboard Widgets

**Status:** Open
**Priority:** High

## Description

As the PO, I want a dashboard with actionable widgets so I get a morning overview of sprint health, velocity trends, and items needing attention without clicking through multiple pages.

## Acceptance Criteria

### Phase 1: Widget infrastructure
- [ ] Widget grid layout system in the Dashboard page using CSS Grid (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
- [ ] Base `DashboardWidget` component with title, optional subtitle, loading skeleton, and error state
- [ ] Widget data fetching via dedicated API routes (one per widget)
- [ ] Auto-refresh interval (configurable, default 5 minutes)

### Phase 2: Sprint Progress widget
- [ ] API route `GET /api/widgets/sprint-progress` returning current sprint stats: total tickets, done count, in-progress count, remaining points
- [ ] Visual progress bar showing percentage complete (points-based)
- [ ] Sprint name and days remaining label
- [ ] Color coding: green (on track), amber (behind), red (at risk based on velocity)

### Phase 3: Velocity Trend widget
- [ ] API route `GET /api/widgets/velocity` returning last 5 sprints' committed vs completed points
- [ ] Simple bar chart (CSS-only, no chart library) showing trend
- [ ] Average velocity line indicator
- [ ] Hover state showing exact numbers per sprint

### Phase 4: Attention Required widget
- [ ] API route `GET /api/widgets/attention` returning items needing PO action
- [ ] List of: stale stories (quality score outdated), stories without AC, unreviewed PRs, failed syncs
- [ ] Each item links to the relevant page/ticket
- [ ] Badge count shown in sidebar Dashboard nav item

### Phase 5: Recent Activity widget
- [ ] Shows last 10 activity log entries (reuses activity log API with limit param)
- [ ] Compact format: icon + description + relative timestamp
- [ ] "View all" link to Activity Log page

### Phase 6: Story Writer Stats widget
- [ ] API route `GET /api/widgets/story-writer-stats` returning session count, drafts generated, drafts applied this sprint
- [ ] Simple stat cards with counts and trend arrows (up/down vs previous sprint)

## Technical Notes

- Widget API routes under `src/app/api/widgets/`
- Each widget fetches independently (no single mega-query)
- Use SWR with `refreshInterval` for auto-refresh
- Widgets should gracefully degrade: show "No data" when sprint has no tickets
- Sprint progress calculation: use story points, fall back to ticket count if no points

## Out of Scope (for now)
- Drag-and-drop widget reordering
- Custom widget selection (all widgets shown by default)
- Morning brief text generation (requires workspace agent)
- Widget configuration panel
