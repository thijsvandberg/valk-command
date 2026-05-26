# BRDG-200: VRW Test Suite

**Status:** Completed
**Priority:** Medium

## Description

As a developer working on VRW (Valk Remote Workspace), I want a test suite so that changes to task processing, session management, and scheduling can be verified automatically without manual testing.

VRW currently has zero tests and zero test infrastructure. All 13 source modules (~3000 LOC) are untested.

## Implementation Plan

1. **Infrastructure**: Install vitest, add `vitest.config.ts`, add test scripts, exclude `*.test.ts` from build
2. **Config** (`config.test.ts`): defaults, env var overrides, schedule YAML loading
3. **SessionStore** (`session-store.test.ts`): CRUD, persistence round-trip, corrupted file recovery (real temp dirs)
4. **Skills** (`skills.test.ts`): registry lookup, prompt loading with frontmatter stripping, args injection, unknown skill error (mock fs)
5. **Auth** (`auth-refresh.test.ts`): isAuthError checks, token expiry detection, refresh flow, credential file I/O (mock fs + fetch)
6. **Reports** (`reports.test.ts`): run history CRUD, report save/find by token, latest report lookup (real temp dirs)
7. **StreamRunner** (`stream-runner.test.ts`): CLI event parsing (system/assistant/result/error), SSE emission, timeout, kill (mock child_process)
8. **PersistentSession** (`persistent-session.test.ts`): state machine (idle/busy/dead), send/kill, timeout handling, event parsing (mock child_process)
9. **SessionPool** (`session-pool.test.ts`): create/get/remove, LRU eviction, idle timeout, killAll, stats (mock PersistentSession, fake timers)
10. **TaskQueue** (`task-queue.test.ts`): enqueue/cancel, sequential processing, status transitions, subscribe/replay, message enqueue, shutdown (mock all deps)
11. **Scheduler** (`scheduler.test.ts`): cron registration, job execution, output parsing, concurrent run guard (mock node-cron, runner, skills, reports)
12. **Integration** (`task-queue.integration.test.ts`): end-to-end task lifecycle with mocked child_process only

Execution order follows dependency graph: leaf modules (2-6) first, then modules requiring mocks of lower layers (7-9), then top-level orchestrators (10-12).

## Acceptance Criteria

### Infrastructure setup
- [x] Vitest installed and configured for ESM (`type: "module"`)
- [x] `npm run test` command works
- [x] Test files use `*.test.ts` co-located pattern

### Unit tests: core modules
- [x] **TaskQueue** (`task-queue.ts`): enqueue, dequeue, sequential processing, cancel, status transitions (queued/running/completed/failed), listener subscribe/unsubscribe, event replay for late-joining clients
- [x] **SessionPool** (`session-pool.ts`): create/get/remove sessions, idle timeout cleanup, LRU eviction at max capacity, `killAll()` for shutdown
- [x] **PersistentSession** (`persistent-session.ts`): state machine (idle/busy/dead), send while busy throws, kill transitions to dead, timeout handling
- [x] **StreamRunner** (`stream-runner.ts`): CLI event parsing (system, assistant, result, error), SSE event emission, timeout behavior
- [x] **SessionStore** (`session-store.ts`): get/set/delete/list, persistence to JSON file, load from corrupted file
- [x] **Config** (`config.ts`): defaults, env var overrides, schedule YAML loading

### Unit tests: supporting modules
- [x] **Skills** (`skills.ts`): skill registry lookup, prompt loading, args injection, unknown skill error
- [x] **Auth** (`auth-refresh.ts`): token expiry check, refresh buffer logic, credential file read/write
- [x] **Reports** (`reports.ts`): load run history, find report by token, latest report lookup

### Integration-style tests (optional, if feasible without live Claude)
- [x] **TaskQueue + StreamRunner**: mock the `claude` subprocess, verify end-to-end task lifecycle with event capture
- [x] **Scheduler**: verify cron job registration and trigger callback

## Technical Notes

- **Framework:** Vitest (best ESM support, fast, compatible with the existing TypeScript setup)
- **Location:** VRW at `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/`
- **Module system:** ESM (`"type": "module"` in package.json), all imports use `.js` extensions
- **Mocking strategy:**
  - `child_process.spawn` must be mocked for StreamRunner and PersistentSession tests (no live Claude calls)
  - `fs` operations for SessionStore and Reports can use temp directories
  - Express routes (index.ts) can be tested with `supertest` if desired, but not required for MVP
- **Dependencies to add:** `vitest` (devDependency)
- **Config:** Add `vitest.config.ts` at project root. Vitest handles ESM natively, no extra tsconfig needed.
- The core testable logic is in state machines (TaskQueue, SessionPool, PersistentSession) and parsers (StreamRunner event handling, Skills prompt assembly). These don't require network or subprocess access when properly mocked.

## Dependencies

None
