# BRDG-091: Stakeholder View - Velocity Trend Sparkline

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to show stakeholders a compact velocity sparkline above the sprint overview card so they can see at a glance whether the team is getting faster or slower over recent sprints.

## Acceptance Criteria

- [ ] A small sparkline chart appears above the sprint overview card, showing completed story points per sprint for the last 4-5 sprints of the selected team
- [ ] Sparkline is rendered as inline SVG with no external chart library
- [ ] Data is derived from existing ticket data fetched via the `/api/tickets` endpoint, filtered by sprint and status
- [ ] Only sprints that have ticket data are included in the chart (skip sprints with no data)
- [ ] The sparkline is compact and unobtrusive, fitting naturally above the card without dominating the layout
- [ ] A loading state is shown while historical sprint data is being fetched
- [ ] If fewer than 2 sprints have data, the sparkline is not rendered

## Technical Notes

- Fetch ticket data for the N most recent sprints using the existing `/api/tickets` endpoint
- Compute completed story points per sprint from ticket status and story point fields
- SVG sparkline: render as a polyline with dots at each sprint data point; no axes, no labels beyond tooltips
- Tooltip on hover for each data point shows sprint name and point total
- Keep the component isolated; velocity data should not affect other page state

## Out of Scope

- Velocity comparison across teams
- Predictive velocity or forecast lines
- Exporting the sparkline as an image
- AI-generated commentary on the trend
