# BRDG-200: VRW Test Suite

**Status:** Not Started
**Priority:** Medium

## Description

As a developer working on VRW (Valk Remote Workspace), I want a test suite so that changes to task processing, session management, and scheduling can be verified automatically without manual testing.

VRW currently has zero tests and zero test infrastructure. All 13 source modules (~3000 LOC) are untested.

## Acceptance Criteria

### Infrastructure setup
- [ ] Vitest installed and configured for ESM (`type: "module"`)
- [ ] `npm run test` command works
- [ ] Test files use `*.test.ts` co-located pattern

### Unit tests: core modules
- [ ] **TaskQueue** (`task-queue.ts`): enqueue, dequeue, sequential processing, cancel, status transitions (queued/running/completed/failed), listener subscribe/unsubscribe, event replay for late-joining clients
- [ ] **SessionPool** (`session-pool.ts`): create/get/remove sessions, idle timeout cleanup, LRU eviction at max capacity, `killAll()` for shutdown
- [ ] **PersistentSession** (`persistent-session.ts`): state machine (idle/busy/dead), send while busy throws, kill transitions to dead, timeout handling
- [ ] **StreamRunner** (`stream-runner.ts`): CLI event parsing (system, assistant, result, error), SSE event emission, timeout behavior
- [ ] **SessionStore** (`session-store.ts`): get/set/delete/list, persistence to JSON file, load from corrupted file
- [ ] **Config** (`config.ts`): defaults, env var overrides, schedule YAML loading

### Unit tests: supporting modules
- [ ] **Skills** (`skills.ts`): skill registry lookup, prompt loading, args injection, unknown skill error
- [ ] **Auth** (`auth-refresh.ts`): token expiry check, refresh buffer logic, credential file read/write
- [ ] **Reports** (`reports.ts`): load run history, find report by token, latest report lookup

### Integration-style tests (optional, if feasible without live Claude)
- [ ] **TaskQueue + StreamRunner**: mock the `claude` subprocess, verify end-to-end task lifecycle with event capture
- [ ] **Scheduler**: verify cron job registration and trigger callback

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
