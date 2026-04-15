# BRDG-101: Structured Logging System

**Status:** Done
**Priority:** Low

## Description

The codebase currently uses 42+ raw `console.*` calls spread across lib, components, and API routes. While most are properly prefixed (e.g. `[pipeline-sync]`, `[jira-client]`), there is no way to control log levels, filter output, or route logs to external systems.

This story introduces a lightweight structured logger that:
- Centralizes log output through a single module
- Supports log levels (debug, info, warn, error)
- Preserves existing prefix conventions as structured context
- Can be configured per-environment (verbose in dev, errors-only in prod)

## Implementation Plan

### Step 1: Create `src/lib/logger.ts`
- Add `import "server-only"` at top (same pattern as `auth.ts`, `env.ts`, `agent-fetch.ts`)
- Define level hierarchy: `{ debug: 0, info: 1, warn: 2, error: 3 }`
- Read `process.env.LOG_LEVEL` at module init; default to `"debug"` in dev/test, `"info"` in prod
- Four functions: `debug`, `info`, `warn`, `error` - each calls corresponding `console.*` with `[tag]` prefix
- Export as `export const logger = { debug, info, warn, error }` plus `_setLevel` for test isolation

### Step 2: Create `src/lib/logger.test.ts`
- Test output format: `[tag] message`
- Test each method calls correct `console.*`
- Test level filtering (info suppressed at error level, etc.)
- Test default level is debug in test environment

### Step 3: Migrate `src/lib/` (6 files, ~11 calls)
- `query-timer.ts` - 1 call (`console.warn`)
- `scheduled-tasks.ts` - 1 call (`console.error`)
- `scheduler.ts` - 1 call (`console.error`)
- `pipeline-sync.ts` - 3 calls (`console.log`)
- `agent-fetch.ts` - 1 call (`console.warn` - structured JSON, keep as rest arg)
- `jira-client.ts` - 4 calls (`console.warn/error`)

### Step 4: Migrate `src/app/api/` routes (~13 route files, ~18 calls)
- All console.error and console.log calls in API routes migrated
- Client-side hooks/components left unchanged

### Step 5: Update `.env.example` with `LOG_LEVEL` documentation

### Note on existing tests
- Tests that spy on `console.warn`/`console.error` continue to work since logger delegates to console.*
- No test changes required

## Acceptance Criteria

- [x] New `src/lib/logger.ts` module with `debug`, `info`, `warn`, `error` methods
- [x] Each method accepts a context tag (e.g. `"jira-client"`) and message
- [x] Log level controlled by `LOG_LEVEL` env var (default: `"info"` in prod, `"debug"` in dev)
- [x] All existing `console.log/warn/error` calls in `src/lib/` migrated to use the logger
- [x] All existing `console.error` calls in `src/app/api/` migrated to use the logger
- [x] Client-side `console.warn` calls in hooks/components left as-is (browser devtools are the right tool there)
- [x] No behavioral changes; same information is logged at same severity levels
- [x] Logger is tree-shakeable and adds no bundle size to client components

## Notes

- Keep it simple: no external dependencies, just a thin wrapper
- Do not add structured JSON logging yet; that is a future concern if we add observability tooling
- The `console.warn` calls we just added for `.catch()` blocks should also use the logger where server-side
