# BRDG-144: Epic Picker in Sidebar

**Status:** Draft
**Priority:** Medium
**Depends on:** BRDG-137

## Description

As a Product Owner, I want to change or link an epic to a ticket directly from the sidebar, so I can organize tickets under epics without switching to Jira.

## Implementation Plan

1. **Modify `/api/search/jira`** -- add optional `issuetype` query param that gets injected into the auto-generated JQL. Allows the client to call `GET /api/search/jira?q=my+epic&issuetype=Epic` without needing the server-side project key.
2. **Add `epicKey` handler to PATCH `/api/tickets/[key]`** -- validate epicKey (null or non-empty string), resolve epic name from local DB, update local DB (epic + epicKey fields), fire-and-forget Jira sync via `updateIssue(key, { parent: { key: epicKey } })`, log activity, invalidate cache.
3. **Add `updateEpic` to `api-client.ts`** -- one-liner calling PATCH with `{ epicKey }`.
4. **Create `EpicPicker` component** -- follows SprintPicker/AssigneePicker portal popover pattern. Uses debounced search against `/api/search/jira?issuetype=Epic`. Shows "No epic" option, check mark on selected, loading/empty states.
5. **Integrate into `TicketSidebar`** -- replace static epic display with EpicPicker. Add optimistic state + rollback on failure. Always show epic row for non-epic ticket types.
6. **Write tests** for PATCH epicKey handler.
7. **Final verification** -- lint, typecheck, test, build.

## Acceptance Criteria

- [x] Searchable epic picker dropdown in the sidebar Epic row
- [x] Search epics via existing Jira search (filter by issuetype=Epic)
- [x] Set epic: calls `jiraClient.updateIssue(key, { parent: { key: epicKey } })` and updates local DB
- [x] Remove epic: set parent to null
- [x] Optimistic UI update with rollback on failure

## Technical Notes

- `updateIssue` already supports setting `parent` field via Jira REST API v3
- Epic row already displays in sidebar (BRDG-137), just needs the picker interaction
- Reuse search pattern from SprintPicker/AssigneePicker components
- Update PATCH `/api/tickets/[key]` to support `epicKey` field
