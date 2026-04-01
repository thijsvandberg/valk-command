# VC-015: Sprint Sync Improvements

**Status:** Open
**Priority:** Medium

## Description

The sprint sync from Jira only discovers ~12 of ~20+ sprints because it extracts sprint metadata from a JQL issue search limited to 100 results. Closed sprints are never fetched. The sprint list in the modal needs better management: ability to hide irrelevant sprints, scoped sync per tab, and better sort/feedback.

## Context

The Jira project (VPL) has multiple boards (BT, BM, BO, GXP, Design, Signage), each with active, future, and backlog sprints. The current approach fetches 100 most-recently-updated issues and extracts unique sprint IDs from their sprint custom field. This misses sprints whose issues weren't in the top 100.

Jira screenshot shows ~20 active/future sprints. valk-command only syncs 12.

## Root Cause

`jira-client.ts:getSprints()` (line 223):
- JQL: `project = VPL AND (sprint in openSprints() OR sprint in futureSprints())`
- `maxResults=100` on the issue search, no pagination
- Sprints extracted from `customfield_10007` on returned issues
- Only sprints with issues in the first 100 results are discovered

## Decision: Use Jira Agile API

Investigation confirmed the Agile API is feasible with the current auth setup:
- Auth: Basic Auth (email:token), same as REST API v3
- Base URL: `https://api.atlassian.com/ex/jira/{JIRA_CLOUD_ID}/rest/agile/1.0/board/{boardId}/sprint`
- `JIRA_BOARD_ID=233` is already configured in .env.local
- The Agile API returns sprints directly (no need to extract from issue search results)
- Supports `?state=active,future,closed` filter and pagination via `startAt`/`maxResults`

The old JQL-based approach (`getSprints()`) should be replaced entirely for sprint listing. The JQL approach remains valid for fetching sprint *issues* (`getSprintIssues()`).

Note: the comment in jira-client.ts line 6 ("Uses REST API v3 exclusively to stay within OAuth scopes") refers to OAuth scopes, but the project uses Basic Auth where this restriction does not apply.

## Acceptance Criteria

### Replace sprint discovery with Agile API
- [ ] Add `getSprintsAgile(states)` method to `jira-client.ts` using `/rest/agile/1.0/board/{boardId}/sprint`
- [ ] Support pagination (`startAt` + `maxResults`, loop until `isLast: true`)
- [ ] Support state filtering: `?state=active,future` and `?state=closed`
- [ ] Replace existing `getSprints()` calls with the new method
- [ ] Verify all ~20 active/future sprints from Jira appear after sync

### Sync closed sprints (History tab)
- [ ] Sync closed sprints separately with a limit (e.g., last 30 closed sprints)
- [ ] Store closed sprints alongside active/future in the DB cache (`jira_sprints` appSetting)
- [ ] History tab in sprint modal shows closed sprints after sync

### Scoped sync button
- [ ] Sync button in the modal syncs only the active tab's scope
- [ ] "Sprints" tab: syncs active + future sprints
- [ ] "History" tab: syncs closed sprints
- [ ] Button label reflects scope: "Sync sprints" / "Sync history"

### Hidden sprints
- [ ] Add `hidden_sprints` key in `appSetting` (JSON array of sprint IDs)
- [ ] Add a third tab "Hidden" in the sprint modal
- [ ] Each sprint row gets a hide toggle (eye icon)
- [ ] Hidden sprints are filtered out of Sprints and History tabs
- [ ] Hidden sprints can be restored from the Hidden tab
- [ ] Hiding a pinned sprint also unpins it from the tab bar

### Tab label rename
- [ ] "Current & Upcoming" -> "Sprints"
- [ ] "History" stays as-is
- [ ] "Hidden" for the new third tab

### Sprint list sort order
- [ ] Active sprints first (sorted by startDate), then future sprints (sorted by name)
- [ ] History: sorted by endDate descending (most recent first)
- [ ] Currently undefined (depends on Jira issue update order)

### Error feedback in modal
- [ ] Show sync errors visually in the modal (not just console.log)
- [ ] Brief error message with retry option

## Technical Notes

- Sprint data stored as JSON blob in `appSetting` (key: `jira_sprints`)
- Hidden sprint IDs in separate `appSetting` key (`hidden_sprints`)
- Agile API URL pattern: `{baseUrl}/rest/agile/1.0/board/{boardId}/sprint?state={states}&startAt={n}&maxResults=50`
- Agile API response: `{ maxResults, startAt, isLast, values: [{ id, name, state, startDate, endDate, ... }] }`
- No rate limiting or retry logic exists in jiraFetch; not in scope for this story but worth noting
- No fetch timeout configured; not in scope but worth noting

## Files to Modify

- `src/lib/jira-client.ts` (new Agile API method, replace getSprints)
- `src/app/api/jira/sync-sprints/route.ts` (scoped sync: sprints vs history)
- `src/app/api/jira/sprints/route.ts` (return hidden state per sprint)
- `src/components/sprint-board/SprintListModal.tsx` (Hidden tab, hide toggle, tab rename, scoped sync, sort, error feedback)

## Out of Scope

- Rate limiting / retry logic for Jira API calls (separate concern)
- Fetch timeout configuration (separate concern)
- Multi-board support (current single-board setup is sufficient)
- Sprint goal/description display

## Dependencies

- None (all infrastructure exists)
