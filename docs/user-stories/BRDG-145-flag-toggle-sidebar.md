# BRDG-145: Flag Toggle with Comment in Sidebar

**Status:** Draft
**Priority:** Medium
**Depends on:** BRDG-137

## Description

As a Product Owner, I want to flag/unflag a ticket from the sidebar with an optional reason comment, so I can mark blockers directly from Bridge without switching to Jira.

The flagged banner (BRDG-137) already displays when a ticket is flagged and shows the flag comment from Jira. This story adds the ability to toggle the flag and attach a reason.

## Acceptance Criteria

- [ ] Toggle button on the flagged banner to unflag (when flagged)
- [ ] "Flag this ticket" action in sidebar (when not flagged) with textarea for reason
- [ ] Flagging: sets `flagged: true` via `jiraClient.updateIssue()` AND adds a Jira comment with "flag_on Flag added\n\n{reason}"
- [ ] Unflagging: sets `flagged: false` via `jiraClient.updateIssue()` AND adds a Jira comment with "flag_off Flag removed"
- [ ] Optimistic UI update with rollback on failure
- [ ] Update PATCH `/api/tickets/[key]` to support `flagged` field

## Technical Notes

- `updateIssue(key, { flagged: true/false })` works for toggling the Jira flag field
- Adding a comment uses existing `jiraClient` comment functionality or a new POST to `/rest/api/3/issue/{key}/comment`
- The flag comment format matches Jira's native format so it appears correctly in both systems
