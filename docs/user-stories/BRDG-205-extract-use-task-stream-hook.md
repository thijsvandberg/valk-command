# BRDG-205: Extract useTaskStream Hook

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want a single reusable hook for consuming workspace task SSE streams so that I don't have to reimplement EventSource setup, listener attachment, and cleanup in every component that needs real-time task output.

A helper `attachTaskStreamListeners()` already exists in `src/hooks/useStreamingTask.ts`, but 6 components bypass it and create their own EventSource + manual listener setup:

| Component | Lines of SSE code | What it streams |
|-----------|-------------------|-----------------|
| `TicketReview.tsx` | ~40 | Review generation |
| `RelatedIssueSuggestions.tsx` | ~35 | Related issue suggestions |
| `SubtasksSection.tsx` | ~35 | Subtask generation |
| `EpicPicker.tsx` | ~30 | Epic suggestions |
| `ReviewPopover.tsx` | ~30 | Inline review |
| `SprintEditModal.tsx` | ~30 | Sprint goal generation |

Total duplicated: ~200 lines of nearly identical EventSource boilerplate.

## Approach

Create a `useTaskStream(taskId, handlers)` hook that:
1. Opens an EventSource to `/api/workspace-tasks/{taskId}/stream`
2. Attaches listeners via the existing `attachTaskStreamListeners` helper
3. Handles cleanup on unmount or taskId change
4. Returns `{ status, progress, output, error }`

## Implementation Plan

1. **Create `useTaskStream` hook + `streamTaskAsPromise` utility** in `src/hooks/useTaskStream.ts`
   - Hook: reactive to `taskId` (null = idle), uses `attachTaskStreamListeners` internally
   - Returns `{ status, progress, output, error, close }`
   - Options: `timeout`, `onProgress`, `onResult`, `onError`, `onNetworkError`, `onDone`, `onToolCall`
   - `streamTaskAsPromise(taskId, timeout?)`: Promise wrapper for fire-and-forget patterns (TicketReview, ReviewPopover)

2. **Write tests** for `useTaskStream` in `src/hooks/useTaskStream.test.ts`

3. **Migrate RelatedIssueSuggestions.tsx**: Replace eventSourceRef + attachTaskStreamListeners with `useTaskStream(taskStreamId, callbacks)`

4. **Migrate SubtasksSection.tsx**: Replace suggestEsRef + attachTaskStreamListeners with `useTaskStream(suggestTaskId, callbacks)`, keep retry logic in onError callback

5. **Migrate EpicPicker.tsx**: Replace eventSourceRef + manual listeners with `useTaskStream(suggestTaskId, { timeout: 90_000, ... })`, set taskId to null when picker closes

6. **Migrate TicketReview.tsx**: Replace Promise+EventSource with `streamTaskAsPromise(taskId)`

7. **Migrate ReviewPopover.tsx**: Replace Promise+EventSource with `streamTaskAsPromise(taskId).catch(() => {})`

8. **Migrate SprintEditModal.tsx**: Replace connectStream/reconnectStream with `useTaskStream(activeTaskId, callbacks)`, keep localStorage persistence in callbacks

9. **Final verification**: Run full test suite + build

### Notes
- TicketReview and ReviewPopover use imperative Promise patterns, so they get `streamTaskAsPromise` instead of the hook
- `useStreamingTask.ts` is NOT deleted (still used by useTaskMonitoring and internally by the new hook)
- SprintEditModal.test.tsx may need mock adjustments

## Checklist

- [ ] Design the `useTaskStream` hook API
- [ ] Implement `useTaskStream` in `src/hooks/useTaskStream.ts`
- [ ] Migrate `TicketReview.tsx` to use the hook
- [ ] Migrate `RelatedIssueSuggestions.tsx`
- [ ] Migrate `SubtasksSection.tsx`
- [ ] Migrate `EpicPicker.tsx`
- [ ] Migrate `ReviewPopover.tsx`
- [ ] Migrate `SprintEditModal.tsx`
- [ ] Verify real-time streaming still works for all 6 features
- [ ] All existing tests pass
