# VC-036: Missing Hook Test Coverage

**Status:** Completed
**Priority:** Medium

## Description

7 of 11 custom hooks lack test coverage. These hooks contain significant business logic (sync polling, sprint board state, story writing, workspace health) that should be tested to prevent regressions.

## Current Coverage

| Hook | Has Tests | Complexity |
|------|-----------|------------|
| `useConversations.ts` | Yes | Low |
| `useLocalStorage.ts` | Yes | Low |
| `useMessages.ts` | Yes | Medium |
| `usePageTitle.tsx` | Yes (added) | Low |
| `useIncrementalSync.ts` | Yes (added) | High |
| `useJobs.ts` | Yes (added) | Medium |
| `useSprintBoard.ts` | Yes (added) | High |
| `useStoryWriter.ts` | Yes (added) | Very High |
| `useStoryWriterDrafts.ts` | Yes (added) | Medium |
| `useTaskMonitoring.ts` | Yes (added) | High |
| `useWorkspaceHealth.ts` | Yes (added) | Medium |
| `useWorkspaceTask.ts` | Yes (added) | High |

## Acceptance Criteria

- [x] Test file exists for every hook in `src/hooks/`
- [x] Tests cover the primary success and error paths
- [x] Tests use `@testing-library/react` renderHook pattern
- [x] All tests pass in CI
