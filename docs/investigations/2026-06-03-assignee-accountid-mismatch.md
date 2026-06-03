# Investigation: Assignee picker sends display name as Jira accountId

**Date:** 2026-06-03
**Found during:** BRDG-264 (watcher support)

## Observation

The assignee picker is fed by `/api/jira/assignable-users`, which is sourced
**only from the local SQLite `ticket` table** (distinct `assignee` display-name
strings). That route sets `accountId = displayName` and `avatarUrl = null` for
every user, because no real Atlassian `accountId`s are stored anywhere in the DB.

When a user picks an assignee, `TicketMetaContent.handleAssigneeChange` posts that
value as `accountId` to `/api/jira/assign`, which calls
`jiraClient.assignIssue(key, accountId)` → `PUT /rest/api/3/issue/{key}/assignee`
with `{ accountId: <displayName> }`.

## Why this matters

Jira Cloud's assignee endpoint expects an **opaque Atlassian accountId**, not a
display name. Sending a display name should not resolve to a real account, so the
assignee write to Jira is likely failing (or silently not assigning the intended
person) in environments with live Jira configured. The local DB still updates its
`assignee` string regardless, so the UI looks correct even if Jira did not change.

This was not introduced by BRDG-264 — it is pre-existing. BRDG-264 deliberately
avoided the problem for watchers by sourcing candidates from a Jira-backed route
(`/api/jira/watcher-candidates` → `getAssignableUsers`) that returns real accountIds.

## Suggested follow-up

Consider a dedicated user story to correct the assignee data source the same way:
either back `assignable-users` with `jiraClient.getAssignableUsers` (real accountIds
+ avatars, enriched with local favorites/teams) or add a parallel candidates route
for the assignee picker. Verify against live Jira before/after.
