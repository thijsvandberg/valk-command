# BRDG-092: Stakeholder View - Sprint Health Summary

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want a single-sentence health summary auto-computed from sprint data to appear at the top of the sprint overview so stakeholders immediately understand the sprint's status without reading through all the ticket columns.

## Implementation Plan

1. Create `src/components/stakeholder/SprintHealthBanner.tsx` — pure client component with health computation logic
2. Render banner in `SprintOverviewCard` above the progress bar, only for active sprints
3. Add unit tests for the health computation function in a co-located test file

## Acceptance Criteria

- [x] A muted callout/banner is shown above the ticket columns for active sprints only
- [x] The summary sentence is computed from sprint data using the following rules (evaluated in order):
  - If 0 points are done and 2 or fewer working days remain: "At risk: no points completed with X days remaining"
  - If done percentage is 80% or higher: "On track: sprint nearly complete"
  - If done percentage is below 25% and 50% or fewer working days remain: "Behind: only X% complete at the halfway mark"
  - Otherwise: "In progress"
- [x] Working days remaining are calculated from the sprint end date, excluding weekends
- [x] The banner is not shown for completed or future sprints
- [x] The summary updates reactively when sprint data changes (e.g. after a refresh)

## Technical Notes

- Done percentage = completed story points / total story points in the sprint
- Working days remaining: count business days (Mon-Fri) from today to sprint end date (inclusive)
- All computation is client-side; no AI or API calls are involved
- The callout styling should be visually distinct but muted (not alarming for "In progress" state); consider a subtle left border or background tint
- Reuse the sprint data already loaded for the sprint overview card; no additional fetching required

## Out of Scope

- AI-generated summaries (see BRDG-090)
- Configurable health thresholds
- Per-epic health breakdowns
- Email or Slack delivery of the summary
