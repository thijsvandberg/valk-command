# BRDG-144: Sprint Details and Goal Management

**Status:** Bridge Complete (VRW skill pending)
**Priority:** Medium

## Description

As the PO, I want to view and edit sprint details (start/end date, sprint goal) directly from the sprint board header, so I can manage sprint metadata without switching to Jira.

The sprint name in the header should reveal dates and goal on click/hover. An edit action opens a modal to update these fields, with changes synced back to Jira. The sprint goal field includes an AI suggest button that generates a goal based on the sprint's tickets.

## Implementation Plan

1. **Extend Sprint type** (`src/types/ticket.ts`): Add `goal: string | null` to the `Sprint` interface.
2. **Update `mapJiraSprints()`** (`sprint-board-utils.ts`): Widen input type to include `goal`, propagate to output.
3. **Fix SprintStatsPopover** (`SprintStatsPopover.tsx`): Add missing `goal` to mapped Sprint object (line ~112).
4. **Create `SprintDetailsPopover`** (`src/components/sprint-board/SprintDetailsPopover.tsx`): Popover showing dates, goal, edit button. Uses existing `Popover` component.
5. **Integrate popover into SprintBoard** (`SprintBoard.tsx`): Make sprint name clickable, toggle popover. Guard: non-All, non-saved-view only.
6. **Add `updateSprint()` to `JiraClient`** (`jira-client.ts`): PUT `/rest/agile/1.0/sprint/{id}` with `{ goal, startDate, endDate }`.
7. **Create API route `PUT /api/jira/sprints/[id]`** (`src/app/api/jira/sprints/[id]/route.ts`): Proxy to Jira, update local cache, invalidate.
8. **Add client-side API helper** (`api-client.ts`): `jira.updateSprint()` method.
9. **Create `SprintEditModal`** (`src/components/sprint-board/SprintEditModal.tsx`): Date inputs, goal textarea, AI suggest button, save/cancel.
10. **Wire modal into SprintBoard** (`SprintBoard.tsx`): Open from popover edit button.
11. **Create `POST /api/sprints/[id]/suggest-goal`** route: Proxy to workspace skill `/suggest-sprint-goal`. Returns taskId for SSE streaming.
12. **VRW skill** (`/suggest-sprint-goal`): Out of scope for this repo. Bridge route built but non-functional until VRW skill exists.

## Acceptance Criteria

### Phase 1: Sprint details popover
- [x] Clicking or hovering on the sprint name (e.g., "BT: 137") shows a popover with:
  - Sprint start date and end date (formatted)
  - Sprint goal text (or "No goal set" placeholder)
  - Edit icon/button to open the edit modal
- [x] Popover only appears for non-All, non-saved-view sprint contexts
- [x] Sprint goal is fetched from the existing sprint sync data (already includes `goal` field)

### Phase 2: Sprint edit modal
- [x] Modal with editable fields:
  - Start date (date picker)
  - End date (date picker)
  - Sprint goal (textarea)
- [x] AI suggest button next to the goal textarea:
  - Sends current sprint tickets (titles, epics, types, story points) to the workspace agent
  - Workspace generates a concise sprint goal suggestion
  - Suggestion is shown inline; user can accept, edit, or dismiss
- [x] Save button syncs changes to Jira via `PUT /rest/agile/1.0/sprint/{sprintId}`
- [x] Cancel discards changes
- [x] Success toast on save; error toast on failure

### Phase 3: Jira sync
- [x] New API route `PUT /api/jira/sprints/[id]` that proxies updates to the Jira Agile API
- [x] Supported fields: `startDate`, `endDate`, `goal`
- [x] After successful Jira update, refresh the local sprint cache
- [x] Handle Jira permission errors gracefully (read-only boards)

### Phase 4: VRW workspace skill
- [ ] New workspace skill `/suggest-sprint-goal` in VRW <!-- skipped: VRW skill must be created in the valk-remote-workspace repo, out of scope for this codebase -->
- [ ] Skill input: sprint name, list of ticket summaries with epic/type/SP <!-- skipped: depends on VRW skill above -->
- [ ] Skill output: a concise sprint goal (1-2 sentences) capturing the sprint's theme <!-- skipped: depends on VRW skill above -->
- [x] Bridge API route `POST /api/sprints/[id]/suggest-goal` that invokes the workspace skill
- [x] Streaming response so the UI can show the suggestion as it generates

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
