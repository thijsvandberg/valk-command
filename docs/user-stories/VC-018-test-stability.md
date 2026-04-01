# VC-018: Test Stability & CI Reliability

**Status:** Done
**Priority:** Critical
**Estimate:** Small

## Description

The test suite (`npx vitest run`) hangs indefinitely after all tests complete and never exits. Additionally, 5 tests in `sync-tickets/route.test.ts` are failing. This blocks CI and prevents reliable merges.

## Context

The codebase has ~140+ passing tests across API routes, components, hooks, and utilities. The vitest process completes all test execution but then hangs with 4 worker threads alive. This is likely caused by unclosed SQLite database handles in the test helper.

Separately, the `sync-tickets/route.test.ts` tests (lines 33-82) call the POST handler expecting specific database rows, but the assertions don't match the current demo-mode data shape.

## Acceptance Criteria

### Phase 1: Fix test hang
- [x] Investigate why vitest workers don't exit after all tests complete
- [x] Check `src/db/test-utils.ts` for unclosed database connections (the `createTestDb()` function creates in-memory SQLite databases that may not be closed)
- [x] Add proper cleanup: either close DB connections in `afterAll` hooks or add a vitest `globalTeardown` that forces cleanup
- [x] Verify `npx vitest run` exits cleanly with exit code 0

### Phase 2: Fix failing sync-tickets tests
- [x] Run `npx vitest run src/app/api/jira/sync-tickets/route.test.ts` and capture exact error messages
- [x] The tests at lines 33-82 call `POST` with `sprintId=134` but the Jira client isn't mocked for that path. When `isLive()` returns false, the demo fallback data may not match what the tests expect
- [x] Either mock the Jira client in these tests (preferred) or align assertions with the actual demo data
- [x] Verify all 7 tests in the file pass

### Phase 3: Build stability
- [x] `npm run build` intermittently fails with `PageNotFoundError: Cannot find module for page` on various pages
- [x] Root cause: the lazy Proxy in `src/db/index.ts:21-30` triggers native SQLite initialization during Next.js static page collection
- [x] Add a build-time guard (e.g., check `process.env.NODE_ENV` or `process.env.NEXT_PHASE`) to prevent DB initialization during build
- [x] Verify `npm run build` passes 5 consecutive times without failure

## Key Files

- `src/db/test-utils.ts` - test database helper (main suspect for hang)
- `src/db/index.ts` - database initialization with Proxy pattern
- `src/app/api/jira/sync-tickets/route.test.ts` - failing tests
- `vitest.config.ts` - vitest configuration

## Verification

```bash
npx vitest run          # must exit cleanly, 0 failures
npm run build           # must pass consistently
npm run lint            # must pass
npm run typecheck       # must pass
```
