# BRDG-100: Close Critical Test Coverage Gaps

**Status:** Done
**Priority:** High

## Description

The codebase has 807 passing tests across 90 files, but several critical modules have no test coverage at all. This creates risk for regressions in core functionality like scheduling, auth, workspace tasks, and settings persistence.

### Coverage gaps by priority

**Critical (security/core functionality):**
- `src/app/api/auth/login/route.ts` - JWT session creation
- `src/app/api/auth/logout/route.ts` - Session clearing
- `src/app/api/auth/setup/route.ts` - Initial secret generation
- `src/app/api/workspace-tasks/` - All 5 endpoints (0% coverage)
- `src/app/api/settings/` - All 4 endpoints (0% coverage)
- `src/lib/scheduler.ts` - Core job orchestration engine
- `src/lib/cron.ts` - Background job scheduling

**High (data integrity):**
- `src/lib/upsert-issue.ts` - Jira ticket upsert logic
- `src/lib/scheduled-tasks.ts` - Task persistence and state
- `src/lib/activity-logger.ts` - Audit trail logging
- `src/app/api/pipelines/` - All 5 endpoints (0% coverage)
- `src/app/api/jira/sprints/route.ts` - Sprint listing
- `src/app/api/jira/sync-comments/route.ts` - Comment sync

**Medium (operational reliability):**
- `src/lib/notifications.ts` - Notification system
- `src/lib/notification-preferences.ts` - User preferences
- `src/app/api/activity-log/` - Acknowledge/cancel workflows (3 untested)
- `src/app/api/story-writer/create/route.ts` - Session creation

## Implementation Plan

Target: 94 new tests across 23 test files. All follow existing patterns (testDb pattern, vi.mock for externals).

### Phase 1: Auth Routes (16 tests) - security-critical
- `auth/login/route.test.ts` (6): valid login, invalid creds, missing hash, missing field, invalid JSON, non-string password
- `auth/logout/route.test.ts` (2): success response, calls clearSessionCookie
- `auth/setup/route.test.ts` (8): GET needsSetup T/F, POST valid setup, already configured, short password, missing, invalid JSON, non-string
- Mock `@/lib/auth` entirely (imports `next/headers` and `server-only`, fails in test context)

### Phase 2: Workspace-Tasks (18 tests) - security-critical
- `workspace-tasks/route.test.ts` (7): GET success/error, POST valid/invalid/rate-limited
- `workspace-tasks/[id]/route.test.ts` (4): GET+DELETE success/error
- `workspace-tasks/[id]/stream/route.test.ts` (3): error paths + SSE headers
- `workspace-tasks/health/route.test.ts` (2) and `skills/route.test.ts` (2)
- Mock `@/lib/agent-fetch` and `@/lib/rate-limiter`

### Phase 3: Settings Endpoints (16 tests)
- `settings/column-config/route.test.ts` (5), `column-widths/route.test.ts` (4), `quick-prompts/route.test.ts` (4), `notification-preferences/route.test.ts` (3)
- DB-only, use testDb pattern

### Phase 4: Scheduler + Cron (14 tests)
- `scheduler.test.ts` (10): register, tick timing, disabled tasks, error handling, concurrency guard, persistence
- `cron.test.ts` (4): valid/invalid expressions - pure function, no mocks needed
- Use `vi.resetModules()` for scheduler to reset module-level state

### Phase 5: Data Integrity (12 tests)
- `upsert-issue.test.ts` (5): normalizeIssueType, normalizeStatus, insert, update, userColor
- `activity-logger.test.ts` (3): logActivity happy path, failed status, custom duration
- `notifications.test.ts` (4): createNotification, skip when disabled, createOrUpdate dedup

### Phase 6: Pipeline Endpoints (10 tests)
- `pipelines/health/route.test.ts` (3), `last-deployed/route.test.ts` (3), `deploy-settings/route.test.ts` (4)

### Phase 7: Remaining (8 tests)
- `activity-log/acknowledge-all/route.test.ts` (2), `cancel-all/route.test.ts` (3), `jira/sprints/route.test.ts` (3)

### Implementation order: Phase 1 → 2 → 4 → 3 → 5 → 6 → 7

## Acceptance Criteria

- [x] All auth routes have tests covering: valid login, invalid credentials, logout, setup flow
- [x] All workspace-tasks endpoints tested: list, detail, stream, skills, health
- [x] All settings endpoints tested: GET/PUT for column-config, column-widths, quick-prompts, notification-preferences
- [x] `scheduler.ts` tested: job queue, timing, error handling, concurrent execution
- [x] `cron.ts` tested: expression parsing, next-run calculation
- [x] `upsert-issue.ts` tested: insert, update, conflict handling
- [x] Pipeline endpoints tested: list, tick, health, last-deployed
- [x] Overall test count increases by at least 80 new test cases (115 added)
- [x] All new tests follow existing patterns (vitest, test-utils for DB, vi.mock for externals)

## Notes

- Prioritize auth and workspace-tasks first as they are security-critical
- Use the existing `src/db/test-utils.ts` for database test isolation
- Each test file should be co-located with its source file
