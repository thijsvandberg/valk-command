# BRDG-096: Stakeholder View - Sprint Comparison Mode

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to show stakeholders the current and previous sprint side-by-side so they can see what was completed last sprint and what the team is working on now in a single view.

## Implementation Plan

1. Read `compare` from `useSearchParams`; toggle via router by adding/removing `?compare=1`
2. Add "Compare" button to ViewHeader actions (disabled when no previous sprint)
3. When comparison active: fetch previous sprint tickets via SWR, render two-panel grid layout
4. Disable prev/next navigation arrows while in comparison mode
5. Each panel is an independent `SprintOverviewCard` (epic filters and carry-over state are per-card already)
6. Two-panel layout stacks vertically on narrow viewports (`grid-cols-1 lg:grid-cols-2`)

## Acceptance Criteria

- [x] A "Compare" toggle button is shown in the stakeholder page header
- [x] The toggle is only visible (or enabled) when a previous sprint exists for the selected team
- [x] Activating comparison mode splits the layout into two panels: left = previous sprint, right = current/active sprint
- [x] Each panel renders the full SprintOverviewCard for its respective sprint
- [x] Sprint navigation (prev/next arrows) is disabled while comparison mode is active
- [x] A visible close button (or re-clicking the toggle) exits comparison mode and returns to single-sprint view
- [x] Comparison mode is reflected in the URL via a query parameter (e.g. `?compare=1`) so the state survives a page refresh
- [x] Removing the query parameter or navigating away exits comparison mode

## Technical Notes

- Use Next.js router (`useSearchParams` / `useRouter`) to read and write the `compare` query parameter
- When comparison mode is active, fetch both the current and previous sprint ticket data if not already cached
- Each SprintOverviewCard panel should be independently scrollable if content overflows
- The two-panel layout should stack vertically on narrow viewports (mobile-friendly fallback)
- Carry-over indicators (BRDG-093) and epic filter chips (BRDG-094), if implemented, should be active in each panel independently

## Out of Scope

- Comparing more than two sprints at once
- Comparing sprints across different teams in a single view
- Saving comparison state beyond the URL parameter
- Diff highlighting between the two sprint panels
