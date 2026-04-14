# BRDG-089: Activity Log Coverage

**Status:** Completed
**Priority:** Medium
**Blocks:** BRDG-054 (Activity Log Insights) - insights are only meaningful when these events are captured

## Description

As the PO, I want the Activity Log to capture all significant operations - including story writer sessions, remote agent communication, and agent errors - so I have a complete audit trail and can diagnose failures across the full system, not just Jira syncs.

## Implementation Plan

### Phase 0: Extend `logActivity` helper (prerequisite)
1. Add optional `durationMs?: number` and `startedAt?: string` to `logActivity()` opts in `src/lib/activity-logger.ts`. Existing callers continue to work unchanged.

### Phase 1: Story writer message logging
2. In `messages/route.ts` POST: capture `startedAt` before each `agentFetch` call; call `logActivity` after every terminal outcome (success or failure) for all three paths (find-related, first message, follow-up).

### Phase 2: Session recovery logging
3. In `messages/route.ts` POST: inside the `if (!result.ok && result.status === 410)` block, log the triggering message as failed, then log a separate recovery entry after `recoverSession()` settles.

### Phase 3: Agent communication error logging
4. Add `retryCount: number` to `AgentResult` in `agent-fetch.ts` so routes can include it in `errorDetail`.
5. Add failed `logActivity` calls to `reviews/generate/route.ts` for task-failed and polling-timeout branches.
6. Add failed `logActivity` call to `workspace-tasks/route.ts` POST when the agent returns a non-ok result.

### Phase 4: Related story and draft operations
7. In `apply-draft/route.ts` POST: call `logActivity` after drafts are saved (only when `hasDraft` is true). Summary: "Draft saved for [KEY]".
8. In `apply-related/route.ts` PATCH: call `logActivity` after link/unlink succeeds. Summary: "Related story [OTHER-KEY] linked/unlinked for [KEY]".

### Phase 5: Schema cleanup
9. Confirm `webhook` type is unused (code confirms: never written anywhere). `incremental-sync` IS actively used - keep it.
10. Create migration `drizzle/0032_remove_webhook_activity_type.sql` - rebuild the activity_log table without `webhook` in the CHECK constraint.
11. Remove `"webhook"` from schema.ts enum, types/ticket.ts union, and any UI label maps.

## Background

The current activity log covers Jira sync operations well but is blind to the story writer and remote agent communication. The following events are silently dropped today:

- Story writer messages sent to the remote agent
- Session recovery triggered by a 410 Gone response from the agent
- Draft applications and related story operations
- Agent network errors, timeouts, and retry attempts

This means failures in the story writer workflow leave no trace in the activity log.

## Acceptance Criteria

### Phase 1: Story writer message logging
- [x] Log an activity entry every time a message is sent to the remote agent via the story writer (`POST /api/tickets/[key]/story-writer/messages`)
- [x] Type: `story-writer`, scope: ticket key, status reflects the agent response outcome
- [x] Summary describes the action: "Story writer message sent for [KEY]" on success, or the error type on failure
- [x] Error detail captures the raw error or HTTP status from the agent
- [x] Duration covers the full round-trip to the agent

### Phase 2: Session recovery logging
- [x] When a 410 Gone response triggers session recovery, log a separate activity entry
- [x] Type: `story-writer`, scope: ticket key, status: `success` after recovery completes or `failed` if recovery fails
- [x] Summary: "Story writer session recovered for [KEY]" or "Story writer session recovery failed for [KEY]"
- [x] The recovery entry is a sibling of the triggering message entry, not nested under it

### Phase 3: Agent communication error logging
- [x] When the agent returns a non-retryable error (4xx, auth, not found), log a `failed` entry with the HTTP status and body in `errorDetail`
- [x] When a request exhausts all retries (timeout, 502/503/504), log a `failed` entry with the final error classification (TIMEOUT, UNREACHABLE, etc.) and retry count
- [x] These entries apply to all routes that call the remote agent, not only the story writer
- [x] Do not log individual retry attempts - only log once the operation settles (final success or final failure)

### Phase 4: Related story and draft operations
- [x] Log an activity entry when related story candidates are linked or unlinked (`PATCH /api/tickets/[key]/story-writer/apply-related`)
- [x] Type: `story-writer`, scope: ticket key, summary: "Related story [OTHER-KEY] linked/unlinked for [KEY]"
- [x] Log an activity entry when a draft is applied (`POST /api/tickets/[key]/story-writer/apply-draft`)
- [x] Type: `story-writer`, scope: ticket key, summary: "Draft saved for [KEY]" <!-- note: route extracts/saves drafts; "applied" is ambiguous -->

### Phase 5: Schema cleanup
- [x] Audit the `activityLog` type enum in `src/db/schema.ts`
- [x] Remove `webhook` type (confirmed unused - never written anywhere in codebase). `incremental-sync` IS actively used in `scheduled-tasks.ts` and `sync-incremental/route.ts` - kept.
- [x] Migration `0032_remove_webhook_activity_type.sql` created; TypeScript types updated
- [x] Migration uses `WHERE type != 'webhook'` as safety guard; `webhook` was confirmed absent from all code paths

## Technical Notes

- Use the existing `logActivity()` helper in `src/lib/activity-logger.ts` for all new log calls - do not add a second logging path
- The `messages/route.ts` POST handler already has try/catch structure; wrap the `logActivity()` call after the agent response resolves
- For agent error logging in Phase 3, the right place is `agent-fetch.ts` after the final attempt settles - pass a callback or return structured error metadata to the caller so the route can decide whether to log
- Do not log activity inside `agent-fetch.ts` itself; keep logging at the route level where scope context is available
- Phase 5 migration: use `ALTER TABLE ... CHECK` or a pre-migration SELECT to confirm zero rows with the removed types before writing the migration

## Out of Scope
- Logging auto-save drafts (intentionally excluded - too noisy)
- Per-retry logging (only log final outcome)
- Story writer split mode (low signal; omit unless evidence of user confusion)
- Webhook inbound events from Jira (covered separately by BRDG-016)
