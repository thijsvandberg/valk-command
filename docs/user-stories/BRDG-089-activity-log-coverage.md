# BRDG-089: Activity Log Coverage

**Status:** Open
**Priority:** Medium
**Blocks:** BRDG-054 (Activity Log Insights) - insights are only meaningful when these events are captured

## Description

As the PO, I want the Activity Log to capture all significant operations - including story writer sessions, remote agent communication, and agent errors - so I have a complete audit trail and can diagnose failures across the full system, not just Jira syncs.

## Background

The current activity log covers Jira sync operations well but is blind to the story writer and remote agent communication. The following events are silently dropped today:

- Story writer messages sent to the remote agent
- Session recovery triggered by a 410 Gone response from the agent
- Draft applications and related story operations
- Agent network errors, timeouts, and retry attempts

This means failures in the story writer workflow leave no trace in the activity log.

## Acceptance Criteria

### Phase 1: Story writer message logging
- [ ] Log an activity entry every time a message is sent to the remote agent via the story writer (`POST /api/tickets/[key]/story-writer/messages`)
- [ ] Type: `story-writer`, scope: ticket key, status reflects the agent response outcome
- [ ] Summary describes the action: "Story writer message sent for [KEY]" on success, or the error type on failure
- [ ] Error detail captures the raw error or HTTP status from the agent
- [ ] Duration covers the full round-trip to the agent

### Phase 2: Session recovery logging
- [ ] When a 410 Gone response triggers session recovery, log a separate activity entry
- [ ] Type: `story-writer`, scope: ticket key, status: `success` after recovery completes or `failed` if recovery fails
- [ ] Summary: "Story writer session recovered for [KEY]" or "Story writer session recovery failed for [KEY]"
- [ ] The recovery entry is a sibling of the triggering message entry, not nested under it

### Phase 3: Agent communication error logging
- [ ] When the agent returns a non-retryable error (4xx, auth, not found), log a `failed` entry with the HTTP status and body in `errorDetail`
- [ ] When a request exhausts all retries (timeout, 502/503/504), log a `failed` entry with the final error classification (TIMEOUT, UNREACHABLE, etc.) and retry count
- [ ] These entries apply to all routes that call the remote agent, not only the story writer
- [ ] Do not log individual retry attempts - only log once the operation settles (final success or final failure)

### Phase 4: Related story and draft operations
- [ ] Log an activity entry when related story candidates are linked or unlinked (`PATCH /api/tickets/[key]/story-writer/apply-related`)
- [ ] Type: `story-writer`, scope: ticket key, summary: "Related story [OTHER-KEY] linked/unlinked for [KEY]"
- [ ] Log an activity entry when a draft is applied (`POST /api/tickets/[key]/story-writer/apply-draft`)
- [ ] Type: `story-writer`, scope: ticket key, summary: "Draft applied for [KEY]"

### Phase 5: Schema cleanup
- [ ] Audit the `activityLog` type enum in `src/db/schema.ts`
- [ ] Remove `webhook` and `incremental-sync` types if no implementation exists and none is planned
- [ ] If removal requires a migration, create one; update all related TypeScript types
- [ ] After removal, verify no existing rows use those types (query before migrating)

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
