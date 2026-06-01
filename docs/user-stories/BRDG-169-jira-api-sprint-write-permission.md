# BRDG-169: Fix Jira API permissions for sprint creation

**Status:** Done
**Priority:** High
**Blocked by:** ~~Manual Jira admin action~~ (resolved)

## Description

The "Create Sprint" feature (BRDG-162) fails with `401 Unauthorized; scope does not match` when calling `POST /rest/agile/1.0/sprint`. The Jira API token used by Bridge does not have the required scope/permission to create sprints via the Agile REST API.

Both the API gateway (`api.atlassian.com`) and the direct instance URL (`new-story.atlassian.net`) reject the request, confirming it is a credential-level issue, not a routing issue.

## Acceptance Criteria

- [x] Identify which Jira API token or OAuth app is used by Bridge (check `.env.local` `JIRA_EMAIL` / `JIRA_API_TOKEN`)
- [x] Determine whether this is a personal API token (Basic auth) or an OAuth 2.0 / Connect app token
- [x] For Basic auth (API token): verify the Jira user has "Manage Sprints" permission on the board (Board settings > Permissions). API tokens inherit the user's permissions.
- [x] For OAuth / Connect app: add the `write:sprint:jira-software` scope to the app configuration in Atlassian Developer Console
- [x] Verify sprint creation works from Bridge after the fix

## Resolution

Two changes were needed:

1. **Scope** — added `write:sprint:jira-software` to the scoped API token.
2. **Routing fix (code)** — `createSprint` was routed to the direct instance URL (`new-story.atlassian.net`) as a workaround for an old "scope does not match" gateway error. Basic auth on the direct URL is no longer accepted (returns 401 for every endpoint, including `GET /myself`), while the **API gateway** (`api.atlassian.com`) now honors the scoped token. `createSprint` was switched to `jiraPost` (gateway) and the now-dead `jiraPostDirect` helper was removed in `src/lib/jira-client.ts`. Covered by `src/lib/jira-client.create-sprint.test.ts`.

Verified end-to-end through the running app: `POST /api/jira/sprints` returns `201`.

## Technical Notes

- The token already works for `PUT /rest/agile/1.0/sprint/{id}` (update sprint) and `GET /rest/agile/1.0/board/{id}/sprint` (list sprints), so it has read + partial write access. Only `POST` (create) is rejected.
- The error `"scope does not match"` typically indicates an OAuth/Connect scope limitation rather than a Jira board permission issue. If the token is a plain API token with Basic auth, this error should not occur for a user with board admin rights.
- The Bridge code is ready: `jiraClient.createSprint()` in `src/lib/jira-client.ts` and `POST /api/jira/sprints` route are implemented and tested. This story is purely about fixing the credential/scope configuration.
- Relevant Atlassian docs: https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/#api-rest-agile-1-0-sprint-post

## Out of Scope

- Code changes (the implementation is complete)
- Testing other Agile API write endpoints
