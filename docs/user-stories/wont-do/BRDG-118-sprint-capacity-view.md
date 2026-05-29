# BRDG-118: Sprint Planning Capacity View

**Status:** Open
**Priority:** Medium

## Description

The sprint board shows tickets but has no capacity planning. The PO has no way to see whether the sprint is over-committed, how workload is distributed across team members, or how capacity compares to historical sprints.

This combines elements of BRDG-046 (Team Workload View, open) with sprint planning specifics.

### Proposed features

- **Total story points committed vs team capacity** - configurable per sprint or derived from velocity
- **Per-assignee workload breakdown** - story points assigned to each team member
- **Over-commitment warning** - indicator when sprint points exceed capacity
- **Historical capacity utilization trend** - how full were the last N sprints
- **Visualization** - horizontal bar chart or stacked bar per assignee

### Data sources

- Story points from `ticket.storyPoints` (already synced from Jira)
- Assignee from `ticket.assignee` (already synced)
- Historical velocity from `/api/velocity` (already exists)
- Team capacity would be a new configurable setting

### Location

Could be a tab on the sprint board, a section in the dashboard (BRDG-037), or a standalone view. To be determined during refinement.

## Acceptance Criteria

- [ ] Sprint capacity overview showing committed points vs capacity
- [ ] Per-assignee workload breakdown
- [ ] Over-commitment warning when points exceed capacity
- [ ] Historical utilization trend (last 5 sprints)
- [ ] Capacity configurable per sprint or auto-derived from average velocity
- [ ] Accessible from sprint board view

## Impact

Gives the PO real-time visibility into sprint commitment levels and team workload distribution. Prevents over-commitment by surfacing capacity issues early in sprint planning and provides historical context to inform future planning decisions.
