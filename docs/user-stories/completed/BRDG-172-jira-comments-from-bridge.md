# BRDG-172: Post Jira Comments from Bridge

**Status:** Done
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish)

## Description

As the PO, I want to post comments to Jira directly from Bridge (both from the ticket detail view and the refinement session), so I can document decisions and action items without switching to Jira.

## Implementation Plan

1. **Modify `jiraClient.addComment`** to return the created comment instead of void (backward-compatible)
2. **Extract `userInitials`/`userColor`** from ticket detail route to shared `src/lib/user-utils.ts`
3. **Create API route** `POST /api/tickets/[key]/jira-comments` with validation, rate limiting, Jira API call, local DB insert, cache invalidation
4. **Add `addJiraComment`** method to `src/lib/api-client.ts`
5. **Update `CommentsSection`** (ticket detail): add Jira comment input with send button, confirmation indicator, `onMutate` prop
6. **Update ticket detail page** to pass `onMutate` to `CommentsSection`
7. **Update `CollapsibleComments`** (refinement session): add comment input + quick-post buttons for common annotations
8. **Write tests** for the API route and UI components

Files to create/modify:
- `src/lib/jira-client.ts` (modify return type)
- `src/lib/user-utils.ts` (new, extract shared helpers)
- `src/app/api/tickets/[key]/route.ts` (import from user-utils)
- `src/app/api/tickets/[key]/jira-comments/route.ts` (new endpoint)
- `src/lib/api-client.ts` (add method)
- `src/components/ticket-detail/CommentsSection.tsx` (add Jira comment input)
- `src/app/(app)/tickets/[key]/page.tsx` (pass onMutate)
- `src/components/refinement-session/SessionTicketView.tsx` (add input + quick-post)

## Acceptance Criteria

### Ticket detail view

- [x] New comment input in the Jira Comments section (below the existing read-only list)
- [x] Input has a send button; posting creates the comment in Jira via API
- [x] The new comment appears in the Jira Comments list after cache invalidation
- [x] Brief confirmation indicator when a comment is successfully posted

### Refinement session

- [x] Same Jira comment posting available from the collapsible comments section
- [x] Quick-post button for common refinement annotations (e.g. "Discussed in refinement, ready for dev")

### API

- [x] New endpoint: `POST /api/tickets/[key]/jira-comments` with `{ content: string }`
- [x] Calls `jiraClient.addComment(key, content)`
- [x] Returns the created comment
- [x] Invalidates the ticket detail cache so the new comment appears

## Technical Notes

- `jiraClient.addComment()` already exists and is used for flag comments
- Markdown in the input should be converted to plain text before posting (Jira REST v2 does not accept markdown)

## Out of Scope

- Editing or deleting Jira comments from Bridge
- Mentioning Jira users (@mentions)
- Attaching files to Jira comments
