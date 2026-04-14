# BRDG-086: Dev Workflow Notifications

**Status:** Completed
**Priority:** Medium

## Description

As the PO, I want to receive notifications for important dev workflow events (pipeline failures, PR activity, deployments) so that I can react quickly without having to manually check the sprint board or Bitbucket. Currently pipeline/deployment notifications only fire for followed tickets. This story broadens coverage and adds PR notifications.

## Background

The pipeline sync (`src/lib/pipeline-sync.ts`) already detects state changes and creates notifications via `processStateChanges()`, but only for tickets in the `followedTicket` table. The notification categories `pipeline`, `deployment`, and `pr` exist in the schema and `NotificationBell.tsx` already renders category-specific icons and colors for them.

The Bitbucket integration is mature: pipeline sync runs every 5 minutes via lazy-cron, the `pipelineRun` table tracks state/previous state, and PR data is fetched per-ticket via the dev-info route. What's missing is broader notification coverage and PR event detection.

## Implementation Plan

1. **Refactor `processStateChanges()`** in `src/lib/pipeline-sync.ts`: remove `followedKeys` filter, remove early exit on missing `ticketKey` (allow branch-name fallback), split non-deployment and deployment notification paths.
2. **Phase 1 (pipeline failures):** Notify on FAILED/STOPPED for all tickets. Use `run.ticketKey` in message when present, fall back to `run.branchName`. Skip SUCCESSFUL non-deployment pipelines. Use `createNotification()` from `src/lib/notifications.ts`.
3. **Phase 2 (deployment notifications):** When `run.isDeployment`, notify on both SUCCESSFUL and FAILED/STOPPED for all tickets. Keep existing message format.
4. **Phase 3 (PR notifications):** Add `processPRNotifications()` called from `syncPipelines()` after PR data is resolved. Dedup via SELECT before INSERT checking `linkUrl + category = 'pr'`. "PR opened" when new row with `prUrl` has no prior notification; "PR merged" when `sourceBranch` is set (merge commit).
5. **Phase 4 (cleanup):** Remove `followedKeys` query and `followedTicket` import from `pipeline-sync.ts`.
6. **Tests:** Create `src/lib/pipeline-sync.test.ts` — export `processStateChanges` and `processPRNotifications`, use `createTestDb()`, mock `@/db` and `@/lib/notifications`.

## Acceptance Criteria

### Phase 1: Broaden pipeline failure notifications

- [x] When a pipeline transitions from `IN_PROGRESS` to `FAILED` or `STOPPED`, create a notification regardless of whether the ticket is followed
- [x] Notification message: "Pipeline #{buildNumber} failed for {ticketKey}" (or "Pipeline #{buildNumber} failed on {branchName}" if no ticket key)
- [x] Category: `pipeline`, with `linkUrl` pointing to the Bitbucket pipeline page
- [x] Include `jiraKey` when available
- [x] Do NOT notify on successful pipeline completions (too noisy)

### Phase 2: Deployment notifications

- [x] When a deployment pipeline completes (success or failure), create a notification for all sprint tickets, not just followed ones
- [x] Success message: "Deployed {ticketKey} to {environment}" with category `deployment`
- [x] Failure message: "Deployment to {environment} failed for {ticketKey}" with category `deployment`
- [x] Include `linkUrl` to the pipeline page and `jiraKey`

### Phase 3: PR notifications

- [x] Detect new PRs during pipeline sync (the sync already fetches PR data for merge commits)
- [x] When a new PR is first seen for a sprint ticket, create a notification: "PR opened: {prTitle}" with category `pr`
- [x] When a PR is merged (detected via pipeline merge commit data), create a notification: "PR merged: {prTitle}" with category `pr`
- [x] Include `linkUrl` to the Bitbucket PR page and `jiraKey`
- [x] Deduplicate: do not re-notify for PRs already seen (track by PR URL or build the check into the existing upsert logic)

### Phase 4: Clean up followed-only logic

- [x] Remove the `followedKeys` filter from `processStateChanges()` so all pipeline state changes generate notifications
- [x] Keep the `followedTicket` table and feature for other uses (it may serve sprint board highlighting or other filtering)
- [x] Verify existing followed-ticket notification tests still pass

## Technical Notes

- `processStateChanges()` in `src/lib/pipeline-sync.ts:520-539` is the main insertion point for Phase 1-2. It already creates `alert` rows with correct categories, just gated behind `followedKeys.has()`.
- For Phase 3, PR data is available in `prUrl`, `prTitle`, `prAuthor` columns on `pipelineRun`. A simple approach: when inserting a new `pipelineRun` row that has `prUrl`, check if an alert with that `linkUrl` already exists. If not, create a PR notification.
- The `alert` table has no unique constraint on `linkUrl`, so dedup needs an explicit check (SELECT before INSERT or a new unique index).
- The `NotificationBell.tsx` component already handles `pipeline`, `deployment`, and `pr` categories with appropriate icons and colors. No UI changes needed.
- This story depends on BRDG-085 Phase 1 being done first (sync noise removed), otherwise removing the followed-ticket filter would flood notifications with pipeline successes too.

## Out of Scope

- Bitbucket webhook integration (currently using polling via pipeline sync)
- PR review/approval notifications
- Slack or email delivery of notifications
- Notification preferences (covered by BRDG-085 Phase 3)
