# BRDG-144: Sprint Details and Goal Management

**Status:** Draft
**Priority:** Medium

## Description

As the PO, I want to view and edit sprint details (start/end date, sprint goal) directly from the sprint board header, so I can manage sprint metadata without switching to Jira.

The sprint name in the header should reveal dates and goal on click/hover. An edit action opens a modal to update these fields, with changes synced back to Jira. The sprint goal field includes an AI suggest button that generates a goal based on the sprint's tickets.

## Acceptance Criteria

### Phase 1: Sprint details popover
- [ ] Clicking or hovering on the sprint name (e.g., "BT: 137") shows a popover with:
  - Sprint start date and end date (formatted)
  - Sprint goal text (or "No goal set" placeholder)
  - Edit icon/button to open the edit modal
- [ ] Popover only appears for non-All, non-saved-view sprint contexts
- [ ] Sprint goal is fetched from the existing sprint sync data (already includes `goal` field)

### Phase 2: Sprint edit modal
- [ ] Modal with editable fields:
  - Start date (date picker)
  - End date (date picker)
  - Sprint goal (textarea)
- [ ] AI suggest button next to the goal textarea:
  - Sends current sprint tickets (titles, epics, types, story points) to the workspace agent
  - Workspace generates a concise sprint goal suggestion
  - Suggestion is shown inline; user can accept, edit, or dismiss
- [ ] Save button syncs changes to Jira via `PUT /rest/agile/1.0/sprint/{sprintId}`
- [ ] Cancel discards changes
- [ ] Success toast on save; error toast on failure

### Phase 3: Jira sync
- [ ] New API route `PUT /api/jira/sprints/[id]` that proxies updates to the Jira Agile API
- [ ] Supported fields: `startDate`, `endDate`, `goal`
- [ ] After successful Jira update, refresh the local sprint cache
- [ ] Handle Jira permission errors gracefully (read-only boards)

### Phase 4: VRW workspace skill
- [ ] New workspace skill `/suggest-sprint-goal` in VRW
- [ ] Skill input: sprint name, list of ticket summaries with epic/type/SP
- [ ] Skill output: a concise sprint goal (1-2 sentences) capturing the sprint's theme
- [ ] Bridge API route `POST /api/sprints/[id]/suggest-goal` that invokes the workspace skill
- [ ] Streaming response so the UI can show the suggestion as it generates

## Technical Notes

- Sprint goal is already fetched during sprint sync via Jira Agile API (`GET /rest/agile/1.0/sprint/{id}`) and stored in the `goal` field
- The `Sprint` type in `src/types/ticket.ts` needs to be extended with `goal: string | null`
- Jira Agile API supports `PUT /rest/agile/1.0/sprint/{sprintId}` with body `{ goal, startDate, endDate }`
- The `jira-client.ts` needs a new `updateSprint()` method
- The popover component can reuse the existing `Tooltip` or a new `Popover` primitive
- AI suggestion uses the workspace proxy pattern (same as story writer): `POST /api/workspace-tasks` with skill `/suggest-sprint-goal`
- VRW changes: add a new skill file under the workspace's skill directory

## Out of Scope (for now)

- Editing sprint name (managed in Jira)
- Sprint velocity/capacity planning
- Sprint retrospective notes
