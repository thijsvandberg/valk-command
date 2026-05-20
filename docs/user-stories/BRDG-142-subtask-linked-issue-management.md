# BRDG-142: Subtask & Linked Issue Management

**Status:** In Progress
**Priority:** High
**Depends on:** -

## Description

As the PO, I want to create subtasks, add linked issues with proper relation types, and use AI to discover related tickets, so I can manage issue relationships directly from Bridge without switching to Jira.

Currently the ticket detail view shows subtasks and linked issues as read-only lists synced from Jira. This story adds full management capabilities: creating subtasks (synced to Jira immediately), linking issues with all Jira relation types, filtering subtasks by status, drag-and-drop reordering (persisted to Jira), removing links, and an AI-assisted related issue discovery interface (AI backend in separate story BRDG-143).

## Implementation Plan

1. **Foundation** (SectionHeader, types, jira-client): Extend `SectionHeader` with `actions` + `countLabel` props. Add `parentKey` to `JiraClient.createIssue`. Add `jiraLinkId` to `LinkedIssue` type + API response.
2. **Subtask creation + filtering**: New POST route `api/tickets/[key]/subtasks`. Add api-client methods. Rewrite `SubtasksSection` with inline create form, status filter chips, filtered counts. Wire into page.
3. **Subtask DnD**: Add `sortOrder` column via migration. New POST route `api/tickets/[key]/subtasks/rank`. Implement `@dnd-kit/sortable` in `SubtasksSection` with drag handles and optimistic reorder.
4. **Linked issue management**: New POST/DELETE route `api/tickets/[key]/links`. `LinkIssueDialog` component with relation type dropdown + issue autocomplete. Rewrite `LinkedIssuesSection` with create/delete.
5. **AI suggestions shell**: `RelatedIssueSuggestions` component (UI only, no backend). Wire into `LinkedIssuesSection`.
6. **Polish**: Loading states, error handling, keyboard nav, ESC support.

## Acceptance Criteria

### Phase 1: Subtask creation and filtering
- [x] "Add subtask" button in the Subtasks section header
- [x] Inline form to create a subtask: title (required), issue type defaults to "Sub-task"
- [x] Created subtask is pushed to Jira via API immediately and appears in the list
- [x] New subtask is also inserted into local DB for instant UI update
- [x] Status filter chips above the subtask list (All, To Do, In Progress, Done)
- [x] Filter state is local, not persisted
- [x] Subtask count in the section header reflects filter (e.g., "Subtasks (3 of 5)")
- [x] Empty state per filter ("No subtasks matching this filter")

### Phase 2: Subtask drag-and-drop reordering
- [ ] Subtasks can be reordered via drag-and-drop
- [ ] New order is persisted to Jira (Jira subtask ranking API)
- [ ] Optimistic reorder in the UI, rollback on Jira error
- [ ] Drag handle visible on hover for each subtask row

### Phase 3: Linked issue management
- [ ] "Link issue" button in the Linked Issues section header
- [ ] Link dialog/popover with:
  - Relation type dropdown with all Jira link types, "Relates to" selected by default:
    - **Relates to** / relates to
    - **Blocks** / is blocked by
    - **Is blocked by** / blocks
    - **Clones** / is cloned by
    - **Is cloned by** / clones
    - **Duplicates** / is duplicated by
    - **Is duplicated by** / duplicates
  - Issue picker with autocomplete (search by key or title across all synced tickets)
- [ ] Creating a link pushes to Jira via the existing `createIssueLink` API
- [ ] Link appears in the grouped list immediately after creation
- [ ] Remove link action (icon button) on each linked issue row
- [ ] Removing a link deletes via Jira API and removes from local DB
- [ ] Confirmation before removing a link

### Phase 4: AI-powered related issue search (interface only)
- [ ] "Find related" button in the Linked Issues section header
- [ ] UI shell: loading state, suggestion list layout, empty state
- [ ] Each suggestion shows: issue key, title, relevance indicator, suggested relation type
- [ ] "Link" action on each suggestion opens the link dialog pre-filled with that issue and suggested relation
- [ ] "Dismiss" action to remove a suggestion from the list
- [ ] Backend integration deferred to BRDG-143 (workspace AI search)

### Phase 5: Polish
- [ ] Optimistic UI updates for all create/delete/reorder operations
- [ ] Error handling with toast notifications for failed Jira operations
- [ ] Loading states for Jira API calls
- [ ] Keyboard navigation in autocomplete and dialogs
- [ ] ESC to close dialogs/forms

## Technical Notes

- **Jira subtask creation**: POST `/rest/api/3/issue` with `parent: { key }` and `issuetype: { name: "Sub-task" }`. Project key derived from parent ticket key.
- **Jira subtask ranking**: PUT `/rest/api/3/issue/{key}/rank` or use the Jira Agile REST API to reorder. Check which endpoint is available for the Jira instance.
- **Jira link types**: GET `/rest/api/3/issueLinkType` returns available link types. Standard types: Blocks, Clones, Duplicate, Relates. Each has inward and outward name.
- **Existing infrastructure**: `jira-client.ts` already has `createIssueLink()` and `deleteIssueLink()`. DB tables `ticketSubtask` and `ticketLink` are in place.
- **Autocomplete search**: Hit the existing `/api/tickets` endpoint with a search param for synced tickets. Consider adding Jira JQL search fallback for tickets not yet synced.
- **Drag-and-drop**: Use `@dnd-kit/core` + `@dnd-kit/sortable` (already a common choice in React). Lightweight, accessible, and works well with lists.
- **Optimistic updates**: Use SWR's `mutate` with optimistic data for immediate UI feedback, rollback on error.
- **Components to modify**: `SubtasksSection.tsx`, `LinkedIssuesSection.tsx`. New components: `CreateSubtaskForm`, `LinkIssueDialog`, `RelatedIssueSuggestions`.
