# BRDG-176: Jira Backlog Sync and Display

**Status:** In Progress
**Priority:** Medium

## Description

As a Product Owner, I want to see and manage the Jira backlog (tickets not assigned to any sprint) within Bridge, so I have a complete view of all work items without switching to Jira.

In Jira, the "Overall Backlog" is a separate section containing all tickets that have not yet been pulled into a sprint. Currently Bridge only syncs tickets that belong to active/future/closed sprints, making the backlog invisible. This story adds backlog sync and presents it as a pseudo-sprint tab on the Sprint Board.

## Implementation Plan

### Key Design Decision: Empty String Convention

Existing sync code stores unsprinted tickets with `sprintName = ""` (empty string), not `NULL`. All sync locations (`sync-incremental`, `sync-tickets`, `scheduled-tasks`) use `sprint ? String(sprint.id) : ""`. We keep this convention. The sentinel `"__backlog__"` is used only at the API/UI layer (query params, sprint slot IDs).

### Unit 1: Backlog Initial Sync

Add `getBacklogIssues()` to `jira-client.ts` using JQL `sprint is EMPTY AND project = VPL ORDER BY rank ASC` with pagination. Add one-time backlog seed to `sync-incremental` (gated by `backlog_synced` appSetting flag). After the initial seed, incremental sync already handles backlog updates since it queries all VPL tickets. Support `sprintId=__backlog__` in `sync-tickets` for on-demand backlog refresh.

**Files:** `src/lib/jira-client.ts`, `src/app/api/jira/sync-incremental/route.ts`, `src/app/api/jira/sync-tickets/route.ts`

### Unit 2: Tickets API Backlog Query

Handle `?sprintId=__backlog__` in `GET /api/tickets` by filtering `WHERE sprintName = ''`. Return tickets ordered by `jiraRank ASC`.

**Files:** `src/app/api/tickets/route.ts`

### Unit 3: Sprint Selector Backlog Entry

Append `backlogCount` to the sprints API response. Add synthetic backlog entry in `SprintSelector` between active/future and closed sprints. Visually distinct with `Inbox` icon and ticket count badge. Update `useTickets` hook to support `__backlog__` sprint ID.

**Files:** `src/app/api/jira/sprints/route.ts`, `src/components/sprint-board/SprintSelector.tsx`, `src/hooks/useSprintBoard.ts`, `src/components/sprint-board/sprint-board-utils.ts`

### Unit 4: Sprint Slots Backlog Pinning

Allow `__backlog__` as valid sprint slot ID. Render backlog tab with `Inbox` icon. Hide sprint analytics and details popover when viewing backlog.

**Files:** `src/components/sprint-board/SprintSlots.tsx`, `src/components/sprint-board/SprintBoard.tsx`, `src/app/api/sprint-slots/route.ts`

### Unit 5: Drag-and-Drop To/From Backlog

Add `moveToBacklog(keys)` to `jira-client.ts` (clears sprint field via `customfield_10007: null`). Handle `targetSprintId: "__backlog__"` in `move-sprint` API. Add backlog as always-available drop target in `SprintDropZoneBar`.

**Files:** `src/lib/jira-client.ts`, `src/app/api/jira/move-sprint/route.ts`, `src/components/sprint-board/SprintBoard.tsx`

### Unit 6: All View Grouping

Rename "No sprint" group to "Backlog" in `useGroupBy.ts`. Fix empty-string sprintId handling (use `||` instead of `??` for fallback to `__backlog__`).

**Files:** `src/components/sprint-board/useGroupBy.ts`

### Unit 7-8: Search + Data Integrity

Search already indexes all tickets regardless of sprint. Data integrity is handled by existing incremental sync (extractSprint returns null for unsprinted tickets, producing sprintName = ""). Verify with tests.

## Acceptance Criteria

### Sync
- [x] Backlog tickets are fetched from Jira during sprint sync (tickets where sprint is null/empty)
- [x] Backlog sync uses the same watermark/incremental approach as sprint sync to avoid fetching all 157+ tickets every time
- [x] Synced backlog tickets are stored in the `ticket` table with `sprintName = NULL`
- [x] Backlog sync respects the existing 5-minute cooldown and does not trigger separate rate-limited calls

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
