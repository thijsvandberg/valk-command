# BRDG-101: Structured Logging System

**Status:** Open
**Priority:** Low

## Description

The codebase currently uses 42+ raw `console.*` calls spread across lib, components, and API routes. While most are properly prefixed (e.g. `[pipeline-sync]`, `[jira-client]`), there is no way to control log levels, filter output, or route logs to external systems.

This story introduces a lightweight structured logger that:
- Centralizes log output through a single module
- Supports log levels (debug, info, warn, error)
- Preserves existing prefix conventions as structured context
- Can be configured per-environment (verbose in dev, errors-only in prod)

## Acceptance Criteria

- [ ] New `src/lib/logger.ts` module with `debug`, `info`, `warn`, `error` methods
- [ ] Each method accepts a context tag (e.g. `"jira-client"`) and message
- [ ] Log level controlled by `LOG_LEVEL` env var (default: `"info"` in prod, `"debug"` in dev)
- [ ] All existing `console.log/warn/error` calls in `src/lib/` migrated to use the logger
- [ ] All existing `console.error` calls in `src/app/api/` migrated to use the logger
- [ ] Client-side `console.warn` calls in hooks/components left as-is (browser devtools are the right tool there)
- [ ] No behavioral changes; same information is logged at same severity levels
- [ ] Logger is tree-shakeable and adds no bundle size to client components

## Notes

- Keep it simple: no external dependencies, just a thin wrapper
- Do not add structured JSON logging yet; that is a future concern if we add observability tooling
- The `console.warn` calls we just added for `.catch()` blocks should also use the logger where server-side
