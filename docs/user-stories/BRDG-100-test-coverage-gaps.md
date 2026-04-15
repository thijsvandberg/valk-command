# BRDG-100: Close Critical Test Coverage Gaps

**Status:** Open
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

## Acceptance Criteria

- [ ] All auth routes have tests covering: valid login, invalid credentials, logout, setup flow
- [ ] All workspace-tasks endpoints tested: list, detail, stream, skills, health
- [ ] All settings endpoints tested: GET/PUT for column-config, column-widths, quick-prompts, notification-preferences
- [ ] `scheduler.ts` tested: job queue, timing, error handling, concurrent execution
- [ ] `cron.ts` tested: expression parsing, next-run calculation
- [ ] `upsert-issue.ts` tested: insert, update, conflict handling
- [ ] Pipeline endpoints tested: list, tick, health, last-deployed
- [ ] Overall test count increases by at least 80 new test cases
- [ ] All new tests follow existing patterns (vitest, test-utils for DB, vi.mock for externals)

## Notes

- Prioritize auth and workspace-tasks first as they are security-critical
- Use the existing `src/db/test-utils.ts` for database test isolation
- Each test file should be co-located with its source file
