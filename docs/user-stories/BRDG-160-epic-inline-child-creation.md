# BRDG-160: Inline child issue creation and status filters for epics

**Status:** In Progress
**Priority:** Medium
**Depends on:** -

## Description

As the PO, I want to quickly create new child issues (stories, tasks, bugs) from the epic detail view using an inline input, similar to how subtasks can be created from a story. I also want status filter chips on the epic's child issues list so I can quickly find tickets by status.

Currently the EpicChildrenSection is read-only. The subtask section already has both features (inline creation + status filters), so this follows the same pattern.

## In Scope

- Inline "Create child issue..." input at the bottom of the epic child issues list
- Issue type selector dropdown (Story, Task, Bug) next to the input, defaulting to Story
- Optimistic UI: show placeholder row immediately while Jira creates the ticket
- Status filter chips (All, To Do, In Progress, Done) with counts, matching the subtask section pattern
- New API route `POST /api/tickets/[key]/children` to create a child issue under an epic
- Error feedback when creation fails

## Out of Scope

- Drag-and-drop reordering of epic children
- "Choose existing" / link existing ticket to epic
- Editing child issue details inline
- Epic assignment changes (covered by BRDG-131)

## Implementation Plan

1. **API route + client** - Create `POST /api/tickets/[key]/children/route.ts` (insert into `ticket` table with `epicKey`, not `ticketSubtask`). Add `createChildIssue` to `api-client.ts`.
2. **Wire props** - Add `ticketKey` and `onMutate` props to `EpicChildrenSection`, pass them from `page.tsx`.
3. **Status filters** - Add filter chips (All/To Do/In Progress/Done) with counts, matching `SubtasksSection` pattern.
4. **Inline creation** - Add input row with issue type selector (Story/Task/Bug), optimistic UI, error handling.
5. **Tests** - API route tests + component tests.
6. **Final verification** - lint, typecheck, test, build.

## Acceptance Criteria

### Inline creation
- [x] An inline input row is visible at the bottom of the Child Issues list
- [x] The input has a type selector dropdown (Story, Task, Bug) defaulting to Story
- [x] Pressing Enter creates a child issue in Jira under the current epic
- [x] A placeholder row with spinner appears immediately (optimistic UI)
- [x] On success, the placeholder is replaced with the real ticket (key, status, type icon)
- [x] On failure, the placeholder is removed and an error message is shown
- [x] Pressing Escape clears the input

### Status filters
- [x] Filter chips appear above the list when there are child issues (All, To Do, In Progress, Done)
- [x] Each chip shows a count; chips with zero count are hidden (except All)
- [x] Filtering updates the list and the count label in the section header
- [x] Active filter is visually distinct (elevated background, same style as subtask filters)

### API
- [x] `POST /api/tickets/[key]/children` accepts `{ title: string, issueType: string }`
- [x] Creates issue in Jira with the epic as parent using `jiraClient.createIssue`
- [x] Inserts ticket into local database and invalidates caches
- [x] Logs activity
- [x] Returns the created child issue data

## Technical Notes

Key files to modify:
- `src/components/ticket-detail/EpicChildrenSection.tsx` - add inline input, type selector, status filters, optimistic state
- `src/app/api/tickets/[key]/children/route.ts` - new POST route (model after subtasks route)
- `src/lib/api-client.ts` - add `createChildIssue(key, data)` method
- `src/lib/jira-client.ts` - `createIssue` already supports `issueType` param, no changes needed

The SubtasksSection (`src/components/ticket-detail/SubtasksSection.tsx`) is the direct reference implementation for both the inline creation pattern and the status filter chips.

The epic detail page (`src/app/(app)/tickets/[key]/page.tsx`) already renders `EpicChildrenSection` and passes `onSelectTicket` and `onMutate` props.
