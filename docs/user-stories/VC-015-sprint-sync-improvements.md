# VC-015: Sprint Sync Improvements

**Status:** Open
**Priority:** Medium

## Description

The sprint sync from Jira only discovers ~12 of ~20+ sprints because it extracts sprint metadata from a JQL issue search limited to 100 results. Closed sprints are never fetched. The sprint list in the modal needs better management: ability to hide irrelevant sprints and scoped sync per tab.

## Context

The Jira project (VPL) has multiple boards (BT, BM, BO, GXP, Design, Signage), each with active, future, and backlog sprints. The current approach fetches 100 most-recently-updated issues and extracts unique sprint IDs from their sprint custom field. This misses sprints whose issues weren't in the top 100.

Jira screenshot shows ~20 active/future sprints. valk-command only syncs 12.

## Root Cause

`jira-client.ts:getSprints()` (line 223):
- JQL: `project = VPL AND (sprint in openSprints() OR sprint in futureSprints())`
- `maxResults=100` on the issue search, no pagination
- Sprints extracted from `customfield_10007` on returned issues
- Only sprints with issues in the first 100 results are discovered

## Acceptance Criteria

### Fix sprint discovery limit
- [ ] Increase maxResults or add pagination to ensure all sprints are discovered
- [ ] Alternative: use Jira Agile API (`/rest/agile/1.0/board/{boardId}/sprint`) for direct sprint listing (more reliable)
- [ ] Verify all ~20 active/future sprints from the Jira screenshot are synced

### Sync closed sprints (History tab)
- [ ] Add closed sprint sync: call `getSprints(["closed"])` with a reasonable limit (last N closed sprints, e.g., 20)
- [ ] Store closed sprints alongside active/future in the DB cache
- [ ] History tab in sprint modal shows closed sprints after sync
- [ ] Sync button in the modal should scope to the active tab: "Upcoming" syncs active+future, "History" syncs closed

### Hidden sprints tab
- [ ] Add a `hidden_sprints` key in `appSetting` (JSON array of sprint IDs) to persist hidden state
- [ ] Add a third tab "Hidden" in the sprint modal showing hidden sprints
- [ ] Each sprint row gets a hide/show toggle (eye icon or similar)
- [ ] Hidden sprints are filtered out of the Upcoming and History tabs
- [ ] Hidden sprints can be unhidden from the Hidden tab
- [ ] Hiding a pinned sprint also unpins it from the tab bar

### Rename tab labels
- [ ] "Current & Upcoming" -> "Sprints" (single word, color dot already indicates active vs future)
- [ ] "History" stays as-is (already single word)
- [ ] "Hidden" for the new third tab

## Technical Notes

- Sprint data is stored as a JSON blob in `appSetting` (key: `jira_sprints`)
- Hidden sprint IDs can use a separate `appSetting` key (`hidden_sprints`) to avoid schema changes
- The `boardId` filter in `getSprints()` already supports filtering by board. If `JIRA_BOARD_ID` is not set, all boards are included.
- Consider whether the Agile API approach is feasible given the current auth setup (API gateway + REST API v3). The Agile API may need a different base URL.

## Files to Modify

- `src/lib/jira-client.ts` (getSprints: pagination or Agile API)
- `src/app/api/jira/sync-sprints/route.ts` (support scoped sync: upcoming vs history)
- `src/app/api/jira/sprints/route.ts` (return hidden state per sprint)
- `src/components/sprint-board/SprintListModal.tsx` (Hidden tab, hide toggle, tab rename, scoped sync)
- Possibly `src/db/schema.ts` or `appSetting` for hidden sprint storage

## Dependencies

- None (all infrastructure exists)
