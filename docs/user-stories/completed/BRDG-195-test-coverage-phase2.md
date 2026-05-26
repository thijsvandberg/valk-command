# BRDG-195: Test Coverage Phase 2 - Hooks, Lib Utilities, and Contexts

**Status:** Done
**Priority:** Medium

## Description

Follow-up to BRDG-100. The codebase now has 2063 passing tests across 228 files, but several hooks, lib utilities, and contexts still have no test coverage. These are non-critical but represent gaps that could allow regressions to slip through unnoticed.

## Implementation Plan

Implementation order: pure functions first, then DB utilities, then hooks, then contexts/clients.

**Group 1 - Pure functions (no/trivial mocking):**
1. `format-timestamp.test.ts` - fake timers for deterministic "today/yesterday"
2. `keyboard-shortcuts.test.ts` - verify structure only
3. `sanitize-client.test.ts` - test XSS stripping behavior
4. `clipboard.test.ts` - mock navigator.clipboard
5. `agent-proxy.test.ts` - mock env

**Group 2 - DB utilities (testDb pattern):**
6. `upsert-setting.test.ts` - insert + update
7. `notification-preferences.test.ts` - defaults, merge, invalid JSON
8. `task-registry.test.ts` - register, run, status

**Group 3 - Hooks:**
9. `useRefinementSessions.test.ts` - thin SWR wrapper
10. `usePrismLanguages.test.ts` - mock prismLoader
11. `useDraftSync.test.ts` - mock API + fake timers

**Group 4 - Contexts/Clients:**
12. `ThemeContext.test.tsx` - localStorage + DOM
13. `confluence-client.test.ts` - mock fetch + env

**Skipped (mocking cost exceeds testing value):**
- `usePipelineTick` - fire-and-forget poller, zero branching logic
- `useSchedulerTick` - structurally identical to pipeline tick
- `useStakeholderAnalysis` - 248 lines combining SWR + EventSource + polling; integration test territory
- `review-capture` - pure glue code importing 5 modules; test would only verify mock wiring
- `task-stream-handler` - SSE + DB + notifications; enormous mocking surface
- `ActivityContext` - root orchestration context composing half the app; not self-contained

## Scope

### Hooks without tests (6 files)

- [x] `src/hooks/useDraftSync.ts` - Draft synchronization logic
- [x] `src/hooks/usePipelineTick.ts` - Pipeline polling interval <!-- skipped: fire-and-forget poller with zero branching logic; mocking cost exceeds value -->
- [x] `src/hooks/usePrismLanguages.ts` - Code highlight language loading
- [x] `src/hooks/useRefinementSessions.ts` - Refinement session CRUD
- [x] `src/hooks/useSchedulerTick.ts` - Scheduler polling interval <!-- skipped: structurally identical to pipeline tick; pure wiring -->
- [x] `src/hooks/useStakeholderAnalysis.ts` - Stakeholder AI analysis fetching <!-- skipped: 248-line SWR+EventSource+polling combo; integration test territory -->

### Lib utilities without tests (11 files)

- [x] `src/lib/agent-proxy.ts` - Workspace agent proxy logic
- [x] `src/lib/clipboard.ts` - Clipboard write helper
- [x] `src/lib/confluence-client.ts` - Confluence API client
- [x] `src/lib/format-timestamp.ts` - Date/time formatting
- [x] `src/lib/keyboard-shortcuts.ts` - Shortcut registration
- [x] `src/lib/notification-preferences.ts` - Notification preference persistence
- [x] `src/lib/review-capture.ts` - Review data capture logic <!-- skipped: pure glue code importing 5 modules; test would only verify mock wiring -->
- [x] `src/lib/sanitize-client.ts` - Client-side HTML sanitization
- [x] `src/lib/task-registry.ts` - Active task tracking
- [x] `src/lib/task-stream-handler.ts` - SSE stream parsing for tasks <!-- skipped: 238-line SSE+DB+notifications; enormous mocking surface -->
- [x] `src/lib/upsert-setting.ts` - Generic setting upsert helper

### Contexts without tests (2 files)

- [x] `src/contexts/ActivityContext.tsx` - Activity log context provider <!-- skipped: root orchestration context composing SWR+scheduler+pipeline+health; not self-contained -->
- [x] `src/contexts/ThemeContext.tsx` - Theme switching context

## Technical Notes

- Follow existing test patterns: co-located `*.test.ts`/`*.test.tsx` files next to source
- Use `testDb` pattern for anything touching the database
- Use `vi.mock` for external dependencies (fetch, next/headers, etc.)
- Hooks that are thin wrappers around SWR/fetch may only need basic render + mock tests
- `format-timestamp.ts` and `clipboard.ts` are pure functions, easiest wins first

## Dependencies

None
