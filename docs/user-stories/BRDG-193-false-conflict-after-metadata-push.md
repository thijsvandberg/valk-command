# BRDG-193: Fix false "Metadata changed in Jira" conflict after Bridge-initiated metadata push

**Status:** In Progress
**Priority:** High

## Description

As a PO pushing changes to Jira from Bridge, I want to not see a false "Metadata changed in Jira. Try pushing again." conflict error after I change metadata (title, issue type, story points, etc.) in Bridge, so that I can keep editing and pushing without interruption.

## Problem

When Bridge pushes a metadata change (e.g. issue type, story points, epic link) to Jira via the ticket detail sidebar, Jira's `updated` timestamp changes. However, Bridge does not sync that new timestamp back into the local `jiraUpdatedAt` field on the `ticket` table.

On the next push (e.g. pushing a description edit), `pushToJira()` in `ticket-service.ts` compares the local `jiraUpdatedAt` against the remote `fields.updated`. They no longer match because of the metadata push Bridge itself made. The content hash has not changed, so the code returns `{ conflict: true, contentChanged: false }` and the user sees:

> Metadata changed in Jira. Try pushing again.

This is a false positive. The "conflict" was caused by Bridge itself, not by an external Jira edit. The user has to retry or force-push, which is confusing and breaks flow.

### Reproduction steps

1. Open a ticket in Bridge
2. Change the issue type (or story points, epic link, labels, flag) via the sidebar
3. Edit the description in the editor
4. Click "Push to Jira"
5. See the red "Metadata changed in Jira. Try pushing again." banner

## Implementation Plan

1. **Add `syncJiraTimestamp(key)` helper** in `src/app/api/tickets/[key]/route.ts` that calls `jiraClient.getIssue(key)` and writes `fields.updated` to `ticket.jiraUpdatedAt`. Self-contained error handling (never throws).
2. **Modify all 5 fire-and-forget Jira calls** in the PATCH handler to chain `.then(() => syncJiraTimestamp(key))` after `updateIssue`. For the flag async IIFE, `await syncJiraTimestamp(key)` after the updateIssue call. This keeps the non-blocking pattern intact.
3. **Update route tests** (`route.test.ts`): add `getIssue` to the jira-client mock, add test verifying `jiraUpdatedAt` is synced after a PATCH metadata push.
4. **Add service-layer tests** (`ticket-service.test.ts`): test that when `jiraUpdatedAt` matches the remote (as it would after Bridge sync), `pushToJira` succeeds without conflict. Add negative test confirming real external changes still produce conflicts.

No schema changes. No changes to the conflict detection logic itself.

## Acceptance Criteria

- [x] **No false conflict after Bridge metadata push:** Changing issue type, story points, epic link, labels, or flag in Bridge and then pushing a description edit does not produce a conflict error
- [x] **After metadata push, local `jiraUpdatedAt` is synced** to the new Jira timestamp so the next push does not detect a stale mirror
- [x] **Real external conflicts are still detected:** If someone edits the ticket directly in Jira between syncs, the conflict detection still works correctly
- [x] **Tests cover the scenario:** A test verifies that a Bridge-initiated metadata change followed by a description push does not produce a false conflict

## Technical Notes

### Root cause

In `src/app/api/tickets/[key]/route.ts` (PATCH handler), metadata changes like issue type are pushed to Jira via `jiraClient.updateIssue()` in a fire-and-forget `.catch()` pattern. The local DB is updated but `jiraUpdatedAt` is not refreshed after the Jira call completes. This causes the timestamp mismatch.

### Affected files

| File | Issue |
|------|-------|
| `src/app/api/tickets/[key]/route.ts` | PATCH handler pushes metadata to Jira without syncing `jiraUpdatedAt` back |
| `src/services/ticket-service.ts` | `pushToJira()` conflict detection at line ~82 compares stale `jiraUpdatedAt` |

### Suggested approach

1. **Await the Jira update and sync the timestamp.** In the PATCH handler, after a successful `jiraClient.updateIssue()` call, fetch the updated issue (or use the response) to get the new `updated` timestamp, then write it to `ticket.jiraUpdatedAt`. This ensures the local mirror stays in sync with changes Bridge itself made.
2. **Alternative: re-sync after metadata push.** After the Jira update call, trigger a targeted sync (`/api/jira/sync-tickets`) for the affected ticket key to refresh all local fields including `jiraUpdatedAt`.
3. **Do not change the conflict detection logic itself.** The detection in `pushToJira()` is correct for real conflicts. The fix should be upstream: keep the local timestamp in sync when Bridge is the one making changes.

### Key code paths

- Metadata push: PATCH handler in `src/app/api/tickets/[key]/route.ts`
- Conflict detection: `pushToJira()` in `src/services/ticket-service.ts` (lines ~82-112)
- Timestamp storage: `jiraUpdatedAt` column on `ticket` table in `src/db/schema.ts`
