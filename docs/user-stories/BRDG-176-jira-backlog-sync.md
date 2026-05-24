# BRDG-176: Jira Backlog Sync and Display

**Status:** Not Started
**Priority:** Medium

## Description

As a Product Owner, I want to see and manage the Jira backlog (tickets not assigned to any sprint) within Bridge, so I have a complete view of all work items without switching to Jira.

In Jira, the "Overall Backlog" is a separate section containing all tickets that have not yet been pulled into a sprint. Currently Bridge only syncs tickets that belong to active/future/closed sprints, making the backlog invisible. This story adds backlog sync and presents it as a pseudo-sprint tab on the Sprint Board.

## Acceptance Criteria

### Sync
- [ ] Backlog tickets are fetched from Jira during sprint sync (tickets where sprint is null/empty)
- [ ] Backlog sync uses the same watermark/incremental approach as sprint sync to avoid fetching all 157+ tickets every time
- [ ] Synced backlog tickets are stored in the `ticket` table with `sprintName = NULL`
- [ ] Backlog sync respects the existing 5-minute cooldown and does not trigger separate rate-limited calls

### Sprint Switcher and Board Display
- [ ] "Backlog" appears as an entry in the sprint switcher dropdown, listed below all real sprints (after ACTIVE & FUTURE, before CLOSED)
- [ ] The Backlog entry is visually distinct from regular sprints (e.g. different icon/accent, no date range, ticket count badge showing total backlog size)
- [ ] Selecting the Backlog entry in the sprint switcher loads all unsprinted tickets into the board view
- [ ] Backlog can be pinned to a sprint slot tab, same as any real sprint
- [ ] When displayed, backlog tickets render using the same ticket row components as sprint tickets

### Interaction
- [ ] Drag-and-drop from Backlog to a sprint works (already partially supported via move-to-sprint API)
- [ ] Drag-and-drop from a sprint to Backlog works (clears sprint assignment)
- [ ] Backlog tickets appear in the "All" view when grouping by sprint, under a "Backlog" group heading
- [ ] Backlog tickets are included in global search results

### Data Integrity
- [ ] When a ticket is moved to a sprint in Jira, the next sync correctly moves it out of the backlog in Bridge
- [ ] When a ticket is removed from a sprint in Jira, the next sync correctly places it in the backlog in Bridge
- [ ] Backlog tickets have full PO metadata support (readiness, scores, notes) same as sprint tickets

## Technical Notes

- The Jira Agile API endpoint `GET /rest/agile/1.0/board/{boardId}/backlog` returns backlog issues directly
- Alternative: JQL query `sprint is EMPTY AND project = VPL ORDER BY rank ASC` to fetch unassigned tickets
- Store backlog tickets with `sprintName = NULL` in the existing `ticket` table (no schema changes needed for ticket storage)
- The `sprintSlot` table may need a special sentinel value (e.g. `sprintId = -1` or `sprintId = 0`) to represent the backlog tab slot
- The `sprintNameCache` could store a backlog entry with a fixed ID for display name consistency
- Existing `useGroupBy.ts` already handles a "No sprint" group, rename to "Backlog" for clarity
- Consider pagination for large backlogs (150+ tickets): initial sync should page through results

## Dependencies

- Jira API access to the board's backlog endpoint (may require Jira board admin scope)
- BRDG-011 (Real Jira Integration) - completed
- BRDG-015 (Sprint Sync Improvements) - completed
