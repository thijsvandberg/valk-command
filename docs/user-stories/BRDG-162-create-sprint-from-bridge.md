# BRDG-162: Create Sprint from Bridge

**Status:** In Progress
**Priority:** Medium

## Description

As a PO, I want to create a new Jira sprint directly from the sprint board tab bar so I don't have to switch to Jira for basic sprint management.

Currently, sprints can only be viewed and pinned in Bridge. The tab bar (SprintSlots) shows pinned sprints but has no way to create new ones. A "+" button at the end of the tab row should open a creation dialog that creates the sprint in Jira and immediately pins it to the tab bar.

## Implementation Plan

1. **Add `createSprint` to `jira-client.ts`** - New method using `POST /rest/agile/1.0/sprint` with `jiraPost<JiraSprint>()`, taking `{ name, originBoardId, startDate?, endDate?, goal? }`
2. **Add `POST` handler to `/api/jira/sprints/route.ts`** - Validates name + boardId, calls `jiraClient.createSprint()`, inserts into local `jira_sprints` cache in `app_setting`, invalidates server cache
3. **Add `jira.createSprint()` to `api-client.ts`** - Frontend method calling `POST /api/jira/sprints`
4. **Create `CreateSprintModal.tsx`** - Modal with name (required), start/end date (optional), goal (optional) fields. Board is read-only (single configured board). Mirrors SprintEditModal styling. Shows loading/error states.
5. **Add "+" button to `SprintSlots.tsx`** - Plus icon after DndContext sprint tabs. Disabled with tooltip when slots >= 8.
6. **Wire up in `SprintBoard.tsx`** - Modal open/close state, `onCreated` handler that auto-pins (via `saveSprintSlots`) and navigates to new sprint. Await `mutate("/api/jira/sprints")` before pinning.
7. **Tests** - POST route handler, CreateSprintModal render/submit/error, SprintSlots "+" button visibility and disabled state.

## Acceptance Criteria

- [x] A "+" button is visible at the end of the sprint tab row in SprintSlots
- [x] Clicking "+" opens a "Create Sprint" dialog/modal
- [x] The dialog has fields for: name (required), board/team (required, default to current board), start date (optional), end date (optional), goal (optional)
- [x] On submit, the sprint is created in Jira via the Jira REST API
- [x] After creation, the new sprint is synced into the local sprint cache
- [x] The new sprint is automatically pinned to the tab bar
- [x] The tab bar navigates to the newly created sprint
- [x] Loading state is shown during creation
- [x] Error state is shown if the Jira API call fails
- [x] The "+" button respects the max-slots limit (8); if full, show a tooltip or disable

## Technical Notes

- **Tab bar component:** `src/components/sprint-board/SprintSlots.tsx` renders the tab row
- **New API route:** `POST /api/jira/sprints` to create a sprint via `POST /rest/agile/1.0/sprint` (Jira Agile REST API)
- **Sprint sync:** After creation, call `/api/jira/sync-sprints` or insert the new sprint directly into the local DB cache
- **Auto-pin:** Use existing `saveSprintSlots()` from `sprint-board-utils.ts` to add the new sprint to the slot array
- **Modal component:** Create `src/components/sprint-board/CreateSprintModal.tsx` using existing modal primitives (see SprintEditModal for reference)
- **Board ID:** The Jira create-sprint endpoint requires a `originBoardId`. Use the board ID already configured/available in the sprint sync system.

## Out of Scope

- Editing sprint name after creation (already possible via SprintEditModal)
- Deleting sprints from Bridge
- Sprint planning (moving tickets into the new sprint)

## Dependencies

- Jira integration must be configured (board ID, API credentials)
- Existing sprint tab system (BRDG-014)
