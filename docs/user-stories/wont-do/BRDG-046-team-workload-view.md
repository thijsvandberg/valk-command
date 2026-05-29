# BRDG-046: Team Workload View

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a view grouped by assignee showing their ticket count, total points, and status distribution so I can spot overloaded team members and rebalance work.

## Acceptance Criteria

### Phase 1: Workload overview
- [ ] New view mode toggle on Sprint Board (Table / Heatmap / Workload) or separate page
- [ ] One section per assignee, showing avatar, name, total assigned points
- [ ] Stacked bar per assignee: done (green), in-progress (amber), todo (gray)
- [ ] "Unassigned" section for tickets without assignee

### Phase 2: Workload metrics
- [ ] Average points per person indicator
- [ ] Highlight assignees above 1.5x the average (overloaded)
- [ ] Highlight assignees below 0.5x the average (underloaded)
- [ ] Total team capacity used vs available (if capacity is configured)

### Phase 3: Ticket drill-down
- [ ] Expand assignee section to see their individual tickets
- [ ] Each ticket shows: key, title, status, story points, epic
- [ ] Click to open ticket detail

## Technical Notes

- All data derived from existing ticket table (assignee + storyPoints + status)
- Group-by query on tickets for the selected sprint
- Capacity configuration could be a simple setting (points per person per sprint) stored in appSetting
- No new database tables needed

## Out of Scope (for now)
- Drag tickets between assignees to reassign
- Capacity planning across sprints
- Velocity per individual developer
- Automatic rebalancing suggestions
