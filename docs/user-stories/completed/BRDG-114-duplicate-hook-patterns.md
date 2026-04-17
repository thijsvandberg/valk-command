# BRDG-114: Duplicate Hook Pattern Consolidation

**Status:** Completed
**Priority:** Medium

## Description

Several React hooks duplicate the same patterns, leading to inconsistent behavior and maintenance burden.

### Duplicated patterns found

1. **SSE listener + polling fallback (~80 lines each, duplicated):**
   - `src/hooks/useTaskMonitoring.ts` - EventSource for SSE + polling fallback on failure
   - `src/hooks/useWorkspaceTask.ts` - Same pattern reimplemented independently

2. **Fetch + JSON pattern repeated ~15 times:**
   - `fetch(url).then(r => r.ok ? r.json() : null)` appears in nearly every data-fetching hook
   - No shared error handling, no shared retry logic

3. **Ticket filtering logic duplicated:**
   - Multiple hooks filter tickets by status/assignee/sprint independently
   - No shared `useTicketFilter` utility

4. **Timer cleanup inconsistency:**
   - Some hooks use `useEffect` cleanup with `clearTimeout`
   - Others store refs and clear manually
   - Some miss cleanup entirely

5. **Missing memoization:**
   - `src/hooks/useStoryWriterDrafts.ts` - options object not memoized, causes unnecessary re-renders
   - `src/hooks/usePipelines.ts` - filter object created inline on each render

### Where to look

- `src/hooks/useTaskMonitoring.ts` vs `src/hooks/useWorkspaceTask.ts` (SSE duplication)
- `src/hooks/useStoryWriterDrafts.ts`:options (missing memo)
- `src/hooks/usePipelines.ts`:filter (missing memo)

## Implementation Plan

1. **Create `src/hooks/useStreamingTask.ts`** - shared `attachTaskStreamListeners(es, handlers)` helper + `useStreamingTask.test.ts`; no deps on other hooks
2. **Migrate `useWorkspaceTask.ts`** - replace local `attachStreamListeners` function with the shared helper; fix timeout leak (streamTimeout is a local var never cleared on unmount - store in ref via handle)
3. **Migrate `useTaskMonitoring.ts`** - replace inline EventSource listener setup with the shared helper (polling fallback logic stays as-is; only the SSE attachment code changes)
4. **Fix `usePipelines.ts` memoization** - remove `swr` from `useEffect` deps (causes interval teardown on every render); use `swr.data?.hasRunning` and `swr.mutate` directly; fix `refresh` callback to depend on `swr.mutate` not `swr`
5. **Fix `useStoryWriterDrafts.ts` self-cleanup** - add `useEffect` that clears the 4 timer refs on unmount so the hook doesn't rely on the consumer to call `clearTimers()`
6. **Run full test suite** - verify no regressions

Note: `useStakeholderAnalysis.ts` has the same SSE pattern (a third copy) but is NOT in the AC. Will skip it.

## Acceptance Criteria

- [x] Create shared `useStreamingTask` hook for SSE + polling fallback pattern
- [x] Migrate `useTaskMonitoring` and `useWorkspaceTask` to use shared hook
- [x] Add `useMemo` to unstable objects in hooks (`useStoryWriterDrafts`, `usePipelines`)
- [x] Standardize timer cleanup pattern across all hooks
- [x] All existing tests still pass
- [x] No behavioral regressions

## Impact

Eliminates duplicated SSE/polling logic, fixes memoization gaps that cause unnecessary re-renders, and standardizes timer cleanup to prevent memory leaks. Reduces total hook code by an estimated 150+ lines while making behavior consistent across all data-fetching hooks.
