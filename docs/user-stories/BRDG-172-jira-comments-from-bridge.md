# BRDG-172: Post Jira Comments from Bridge

**Status:** Open
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want to post comments to Jira directly from Bridge (both from the ticket detail view and the refinement session), so I can document decisions and action items without switching to Jira.

## Acceptance Criteria

### Ticket detail view

- [ ] New comment input in the Jira Comments section (below the existing read-only list)
- [ ] Input has a send button; posting creates the comment in Jira via API
- [ ] The new comment appears in the Jira Comments list after cache invalidation
- [ ] Brief confirmation indicator when a comment is successfully posted

### Refinement session

- [ ] Same Jira comment posting available from the collapsible comments section
- [ ] Quick-post button for common refinement annotations (e.g. "Discussed in refinement, ready for dev")

### API

- [ ] New endpoint: `POST /api/tickets/[key]/jira-comments` with `{ content: string }`
- [ ] Calls `jiraClient.addComment(key, content)`
- [ ] Returns the created comment
- [ ] Invalidates the ticket detail cache so the new comment appears

## Technical Notes

- `jiraClient.addComment()` already exists and is used for flag comments
- Markdown in the input should be converted to plain text before posting (Jira REST v2 does not accept markdown)

## Out of Scope

- Editing or deleting Jira comments from Bridge
- Mentioning Jira users (@mentions)
- Attaching files to Jira comments
