# BRDG-114: Duplicate Hook Pattern Consolidation

**Status:** Open
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

## Acceptance Criteria

- [ ] Create shared `useStreamingTask` hook for SSE + polling fallback pattern
- [ ] Migrate `useTaskMonitoring` and `useWorkspaceTask` to use shared hook
- [ ] Add `useMemo` to unstable objects in hooks (`useStoryWriterDrafts`, `usePipelines`)
- [ ] Standardize timer cleanup pattern across all hooks
- [ ] All existing tests still pass
- [ ] No behavioral regressions

## Impact

Eliminates duplicated SSE/polling logic, fixes memoization gaps that cause unnecessary re-renders, and standardizes timer cleanup to prevent memory leaks. Reduces total hook code by an estimated 150+ lines while making behavior consistent across all data-fetching hooks.
