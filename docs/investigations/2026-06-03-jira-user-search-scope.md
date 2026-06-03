# Investigation: Jira token lacks user-search scope

**Date:** 2026-06-03
**Found during:** BRDG-264 (watcher support), live visual verification

## Observation

Calling Jira's assignable-user search returns 401:

```
GET /rest/api/3/user/assignable/search?project=VPL&maxResults=100
-> 401 {"code":401,"message":"Unauthorized; scope does not match"}
```

Other Jira calls made by Bridge with the same credentials succeed (e.g.
`GET /rest/api/3/issue/{key}/watchers` returns 200 with real accountIds). The
failure is specific to the **user search / user enumeration** family of endpoints.

The phrasing "scope does not match" is OAuth-scope language: the connection is
missing the `read:jira-user` scope (granular OAuth 2.0), or, if using a Basic-auth
API token, the account lacks the "Browse users and groups" global permission.

## Impact

- **BRDG-264 (watchers):** the watcher-candidate picker cannot list users, so adding
  a watcher (which needs a real accountId) is blocked. Viewing/removing existing
  watchers is unaffected at the API level because `getWatchers` already returns real
  accountIds.
- **Assignee picker:** today this is sourced from the local DB (display names), so it
  sidesteps user search — but it also means it never had real accountIds either (see
  `2026-06-03-assignee-accountid-mismatch.md`). Any future move to real accountIds for
  assignee would hit the same scope wall.

## Suggested follow-up

1. Grant the Jira app/token the `read:jira-user` scope (or "Browse users and groups"
   permission) and re-verify the watcher picker. This is a Jira configuration change,
   not a code change.
2. Optionally, make watcher **removal** work independently of the candidate list by
   adding a remove affordance directly on the avatar stack (uses the accountIds from
   `getWatchers`, so it works even while user search is unavailable).
