# BRDG-086: Dev Workflow Notifications

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to receive notifications for important dev workflow events (pipeline failures, PR activity, deployments) so that I can react quickly without having to manually check the sprint board or Bitbucket. Currently pipeline/deployment notifications only fire for followed tickets. This story broadens coverage and adds PR notifications.

## Background

The pipeline sync (`src/lib/pipeline-sync.ts`) already detects state changes and creates notifications via `processStateChanges()`, but only for tickets in the `followedTicket` table. The notification categories `pipeline`, `deployment`, and `pr` exist in the schema and `NotificationBell.tsx` already renders category-specific icons and colors for them.

The Bitbucket integration is mature: pipeline sync runs every 5 minutes via lazy-cron, the `pipelineRun` table tracks state/previous state, and PR data is fetched per-ticket via the dev-info route. What's missing is broader notification coverage and PR event detection.

## Acceptance Criteria

### Phase 1: Broaden pipeline failure notifications

- [ ] When a pipeline transitions from `IN_PROGRESS` to `FAILED` or `STOPPED`, create a notification regardless of whether the ticket is followed
- [ ] Notification message: "Pipeline #{buildNumber} failed for {ticketKey}" (or "Pipeline #{buildNumber} failed on {branchName}" if no ticket key)
- [ ] Category: `pipeline`, with `linkUrl` pointing to the Bitbucket pipeline page
- [ ] Include `jiraKey` when available
- [ ] Do NOT notify on successful pipeline completions (too noisy)

### Phase 2: Deployment notifications

- [ ] When a deployment pipeline completes (success or failure), create a notification for all sprint tickets, not just followed ones
- [ ] Success message: "Deployed {ticketKey} to {environment}" with category `deployment`
- [ ] Failure message: "Deployment to {environment} failed for {ticketKey}" with category `deployment`
- [ ] Include `linkUrl` to the pipeline page and `jiraKey`

### Phase 3: PR notifications

- [ ] Detect new PRs during pipeline sync (the sync already fetches PR data for merge commits)
- [ ] When a new PR is first seen for a sprint ticket, create a notification: "PR opened: {prTitle}" with category `pr`
- [ ] When a PR is merged (detected via pipeline merge commit data), create a notification: "PR merged: {prTitle}" with category `pr`
- [ ] Include `linkUrl` to the Bitbucket PR page and `jiraKey`
- [ ] Deduplicate: do not re-notify for PRs already seen (track by PR URL or build the check into the existing upsert logic)

### Phase 4: Clean up followed-only logic

- [ ] Remove the `followedKeys` filter from `processStateChanges()` so all pipeline state changes generate notifications
- [ ] Keep the `followedTicket` table and feature for other uses (it may serve sprint board highlighting or other filtering)
- [ ] Verify existing followed-ticket notification tests still pass

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
