# BRDG-096: Stakeholder View - Sprint Comparison Mode

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to show stakeholders the current and previous sprint side-by-side so they can see what was completed last sprint and what the team is working on now in a single view.

## Acceptance Criteria

- [ ] A "Compare" toggle button is shown in the stakeholder page header
- [ ] The toggle is only visible (or enabled) when a previous sprint exists for the selected team
- [ ] Activating comparison mode splits the layout into two panels: left = previous sprint, right = current/active sprint
- [ ] Each panel renders the full SprintOverviewCard for its respective sprint
- [ ] Sprint navigation (prev/next arrows) is disabled while comparison mode is active
- [ ] A visible close button (or re-clicking the toggle) exits comparison mode and returns to single-sprint view
- [ ] Comparison mode is reflected in the URL via a query parameter (e.g. `?compare=1`) so the state survives a page refresh
- [ ] Removing the query parameter or navigating away exits comparison mode

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
