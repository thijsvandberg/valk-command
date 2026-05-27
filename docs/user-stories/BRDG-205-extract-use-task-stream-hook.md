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
