# BRDG-172: Post Jira Comments from Bridge

**Status:** Open
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want to post comments to Jira directly from Bridge (both from the ticket detail view and the refinement session), so I can document decisions and action items without switching to Jira.

## Context

Currently the CommentsSection has two areas: "PO Comments" (local, stored in Bridge DB) and "Jira Comments" (read-only, synced from Jira). This story adds the ability to write new Jira comments from Bridge. PO Comments remain a separate local-only feature.

## Acceptance Criteria

### Ticket detail view

- [ ] New "Post to Jira" comment input in the Jira Comments section (below the existing read-only list)
- [ ] Input has a send button; posting creates the comment in Jira via API
- [ ] The new comment appears in the Jira Comments list after a short delay (cache invalidation + revalidation)
- [ ] Confirmation indicator (checkmark or brief toast) when a Jira comment is successfully posted
- [ ] PO Comments section stays unchanged (local-only, separate from Jira comments)

### Refinement session

- [ ] Same Jira comment posting available from the collapsible comments section
- [ ] Quick-post button for common refinement annotations (e.g. "Discussed in refinement, ready for dev")

### API

- [ ] New endpoint: `POST /api/tickets/[key]/jira-comments` with `{ content: string }`
- [ ] Calls `jiraClient.addComment(key, content)`
- [ ] Returns the created comment
- [ ] Invalidates the ticket detail cache so the new comment appears in the Jira Comments section

## Technical Notes

- `jiraClient.addComment()` already exists and is used for flag comments
- Markdown formatting in the input should be converted to plain text before posting (Jira does not accept markdown in the REST v2 comment body)
- The Jira Comments section header could show "Jira Comments" with a small "Post" button inline

## Out of Scope

- Editing or deleting Jira comments from Bridge
- Mentioning Jira users (@mentions)
- Attaching files to Jira comments
