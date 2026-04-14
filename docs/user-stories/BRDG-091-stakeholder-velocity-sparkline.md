# BRDG-091: Stakeholder View - Velocity Trend Sparkline

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to show stakeholders a compact velocity sparkline above the sprint overview card so they can see at a glance whether the team is getting faster or slower over recent sprints.

## Implementation Plan

1. Create `src/components/stakeholder/VelocitySparkline.tsx` — pure inline SVG component with tooltip
2. Create `src/hooks/useVelocityData.ts` — fetches last N sprint ticket sets in parallel, computes completed pts per sprint
3. Render sparkline in stakeholder page above `SprintOverviewCard`, using `teamSprints` slice for the last 4-5 sprints

## Acceptance Criteria

- [x] A small sparkline chart appears above the sprint overview card, showing completed story points per sprint for the last 4-5 sprints of the selected team
- [x] Sparkline is rendered as inline SVG with no external chart library
- [x] Data is derived from existing ticket data fetched via the `/api/tickets` endpoint, filtered by sprint and status
- [x] Only sprints that have ticket data are included in the chart (skip sprints with no data)
- [x] The sparkline is compact and unobtrusive, fitting naturally above the card without dominating the layout
- [x] A loading state is shown while historical sprint data is being fetched
- [x] If fewer than 2 sprints have data, the sparkline is not rendered

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
