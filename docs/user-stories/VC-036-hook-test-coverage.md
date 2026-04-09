# VC-036: Missing Hook Test Coverage

**Status:** Open
**Priority:** Medium

## Description

7 of 11 custom hooks lack test coverage. These hooks contain significant business logic (sync polling, sprint board state, story writing, workspace health) that should be tested to prevent regressions.

## Current Coverage

| Hook | Has Tests | Complexity |
|------|-----------|------------|
| `useConversations.ts` | Yes | Low |
| `useLocalStorage.ts` | Yes | Low |
| `useMessages.ts` | Yes | Medium |
| `usePageTitle.tsx` | Yes | Low |
| `useIncrementalSync.ts` | No | High (background polling, abort signals) |
| `useJobs.ts` | No | Medium (CRUD + optimistic updates) |
| `useSprintBoard.ts` | No | High (13 exports, SWR composition) |
| `useStoryWriter.ts` | No | Very High (722 lines, SSE streaming, state machine) |
| `useWorkspaceHealth.ts` | No | Medium (polling, health state) |
| `useWorkspaceTask.ts` | No | High (streaming, task lifecycle) |
| `useStoryWriter.ts` | No | Very High |

## Acceptance Criteria

- [ ] Test file exists for every hook in `src/hooks/`
- [ ] Tests cover the primary success and error paths
- [ ] Tests use `@testing-library/react` renderHook pattern
- [ ] All tests pass in CI

## Priority Order

1. `useStoryWriter` (most complex, highest risk)
2. `useSprintBoard` (most exports, widely used)
3. `useIncrementalSync` (background sync logic)
4. `useWorkspaceTask` (streaming logic)
5. `useWorkspaceHealth`, `useJobs` (simpler)
