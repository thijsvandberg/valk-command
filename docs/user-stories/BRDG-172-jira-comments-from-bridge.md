# BRDG-172: Post Jira Comments from Bridge

**Status:** Open
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want to post comments to Jira directly from Bridge (both from the ticket detail view and the refinement session), so I can document decisions and action items without switching to Jira.

## Acceptance Criteria

### Ticket detail view

- [ ] New "Post to Jira" option in the comments section (alongside existing PO Comments)
- [ ] Comment input with a toggle or tab to switch between "PO Comment" (local) and "Jira Comment" (synced)
- [ ] Jira comments are posted via the Jira API and appear in the Jira comments list after sync
- [ ] Confirmation indicator when a Jira comment is successfully posted

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
- The UI should make it clear which comments are local (PO) vs. synced (Jira)
- Markdown formatting in the input should be converted to Jira ADF or plain text before posting

## Out of Scope

- Editing or deleting Jira comments from Bridge
- Mentioning Jira users (@mentions)
- Attaching files to Jira comments
