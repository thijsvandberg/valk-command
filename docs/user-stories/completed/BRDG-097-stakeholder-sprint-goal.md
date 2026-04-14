# BRDG-097: Stakeholder View - Sprint Goal

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want the Jira sprint goal to be surfaced in the stakeholder view so stakeholders immediately understand what the team is trying to achieve this sprint without me having to repeat it manually.

## Implementation Plan

1. Add `goal?: string` to `JiraSprint` interface in `src/lib/jira-client.ts`
2. Add `goal: string | null` to `StoredSprint` in `src/app/api/jira/sync-sprints/route.ts`; update `sprintToStored()` to extract it
3. Widen sprint type in `src/app/api/jira/sprints/route.ts` to include `goal`
4. Add `goal` to `useJiraSprints` return type in `src/hooks/useSprintBoard.ts`
5. Update `toStakeholderSprint()` in `src/lib/stakeholder-data.ts` to accept and pass `goal` through
6. Update `toStakeholderSprint` unit test (currently asserts goal is always null)
7. Restyle goal display in `SprintOverviewCard` as a left-bordered callout (visually distinct from BRDG-092 health banner)

## Acceptance Criteria

- [x] The sprint goal is shown as a styled callout below the sprint name in the SprintOverviewCard, when a goal is set
- [x] If the sprint has no goal (empty string or null), the callout is not rendered
- [x] The `goal` field from the Jira sprint object is included in the Jira sprint sync and stored in the `jira_sprints` cache (appSetting)
- [x] `toStakeholderSprint` (or equivalent transformation function) passes the `goal` field through to the stakeholder data model
- [x] The currently hardcoded `null` for the goal field is replaced with the actual value from the synced sprint data
- [x] The callout styling is visually distinct from the health summary banner (BRDG-092) to avoid confusion

## Technical Notes

- The Jira REST API sprint object includes a `goal` field; ensure it is read during the sprint sync that populates the `jira_sprints` appSetting cache
- Update the sprint sync logic to extract and store `goal` alongside the fields already being persisted
- Update the TypeScript type for the cached sprint object to include `goal: string | null`
- Update `toStakeholderSprint` to include `goal` in its return type and output
- Update `SprintOverviewCard` to accept and display the `goal` prop
- No new API routes are needed; the goal flows through the existing sprint data path

## Out of Scope

- Allowing the PO to edit the sprint goal from within Bridge (edits must go through Jira)
- Showing the sprint goal in the main sprint board view
- AI-generated elaboration of the sprint goal
- Storing goal history across syncs
