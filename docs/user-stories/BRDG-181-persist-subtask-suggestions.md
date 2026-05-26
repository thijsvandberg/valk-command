# BRDG-181: Persist AI-suggested subtasks

**Status:** To Do
**Priority:** Medium
**Related:** BRDG-180 (Suggest Subtasks Error Handling), BRDG-127 (Refinement Session Mode)

## Description

AI-suggested subtasks are currently ephemeral: they live only in React state and disappear on navigation or page refresh. They should be persisted to the database so that:

- Returning to a ticket in a refinement session shows previously suggested subtasks
- The ticket single view shows previously suggested subtasks
- A count/badge indicates how many pending AI suggestions exist (visible before opening the section)

Declined (dismissed) subtasks do not need to be saved. Only pending and accepted suggestions are stored.

## Implementation Plan

### Step 1: Database schema + migration
- Add `subtask_suggestion` table to `src/db/schema.ts` (id, ticket_key FK cascade, title, created_at)
- Only pending suggestions stored; dismissed/accepted rows are deleted
- Generate migration via `npm run db:generate`

### Step 2: API routes (GET/PUT/DELETE)
- Create `src/app/api/tickets/[key]/subtask-suggestions/route.ts`
- GET: load pending suggestions for a ticket
- PUT: accept `{ output }`, parse via `parseSubtaskSuggestions()`, replace all existing rows
- DELETE: accept optional `{ id }` to remove single suggestion or all

### Step 3: API client + type updates
- Add `getSubtaskSuggestions`, `persistSubtaskSuggestions`, `dismissSubtaskSuggestion` to `api-client.ts`
- Change suggestion type from `string[]` to `Array<{ id: string; title: string }>`

### Step 4: SubtasksSection refactor
- Load persisted suggestions on mount via GET
- After stream completes, persist via PUT and update state with IDs
- Dismiss calls DELETE with suggestion ID
- Accept calls DELETE after Jira subtask creation

### Step 5: Count badge
- Add `pendingSuggestionCount` to ticket detail API response
- Render badge on Sparkles button when count > 0

### Step 6: UI improvements to SubtaskSuggestions
- Replace dashed border with solid + subtle shadow for more permanence
- Increase row padding, add hover transitions
- Match elevated card style used elsewhere

### Step 7: Tests
- API route tests (GET/PUT/DELETE)
- Update SubtaskSuggestions component tests for new props format

## Acceptance Criteria

### Persistence

- [x] New `subtask_suggestion` table exists with migration
- [x] After AI generates suggestions, they are saved to the database
- [x] Navigating away and returning to the ticket shows the saved suggestions
- [x] Dismissed suggestions are deleted from the database (not stored)
- [x] Accepted suggestions are removed from the suggestion table after Jira subtask creation
- [x] Re-running "suggest subtasks" replaces previous pending suggestions

### Visibility across views

- [x] Refinement session shows saved suggestions when revisiting a ticket
- [x] Ticket single view shows saved suggestions
- [x] A count/badge shows the number of pending AI suggestions

### UI improvements

- [x] SubtaskSuggestions panel has improved visual design
- [x] Better spacing, depth, and interaction states
- [x] Consistent with the overall app design language

### Tests

- [x] API route tests for GET/PUT/DELETE subtask-suggestions
- [x] SubtaskSuggestions component rendering tests updated
