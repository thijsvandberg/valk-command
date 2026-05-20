# BRDG-145: Flag Toggle with Comment in Sidebar

**Status:** Done
**Priority:** Medium
**Depends on:** BRDG-137

## Description

As a Product Owner, I want to flag/unflag a ticket from the sidebar with an optional reason comment, so I can mark blockers directly from Bridge without switching to Jira.

The flagged banner (BRDG-137) already displays when a ticket is flagged and shows the flag comment from Jira. This story adds the ability to toggle the flag and attach a reason.

## Implementation Plan

1. **Add `addComment` to JiraClient** (`src/lib/jira-client.ts`) - POST to `/rest/api/3/issue/{key}/comment` with ADF body
2. **Extend PATCH `/api/tickets/[key]`** (`src/app/api/tickets/[key]/route.ts`) - Handle `flagged` + optional `flagReason`, update DB, sync to Jira (updateIssue + addComment)
3. **Add `toggleFlag` to API client** (`src/lib/api-client.ts`) - Frontend helper for the PATCH call
4. **Update flagged banner with unflag button** (`TicketSidebar.tsx`) - Add "Unflag" button, optimistic state, rollback on failure
5. **Add "Flag this ticket" action** (`TicketSidebar.tsx`) - Button + dialog with textarea for reason, optimistic update
6. **Tests** - API route tests for flagged field, sidebar component tests for flag/unflag flows

Files touched: `jira-client.ts`, `route.ts`, `api-client.ts`, `TicketSidebar.tsx`

## Acceptance Criteria

- [x] Toggle button on the flagged banner to unflag (when flagged)
- [x] "Flag this ticket" action in sidebar (when not flagged) with textarea for reason
- [x] Flagging: sets `flagged: true` via `jiraClient.updateIssue()` AND adds a Jira comment with "flag_on Flag added\n\n{reason}"
- [x] Unflagging: sets `flagged: false` via `jiraClient.updateIssue()` AND adds a Jira comment with "flag_off Flag removed"
- [x] Optimistic UI update with rollback on failure
- [x] Update PATCH `/api/tickets/[key]` to support `flagged` field

## Technical Notes

- `updateIssue(key, { flagged: true/false })` works for toggling the Jira flag field
- Adding a comment uses existing `jiraClient` comment functionality or a new POST to `/rest/api/3/issue/{key}/comment`
- The flag comment format matches Jira's native format so it appears correctly in both systems
