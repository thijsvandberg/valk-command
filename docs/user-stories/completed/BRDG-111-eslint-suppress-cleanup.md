# BRDG-111: ESLint Suppress Cleanup

**Status:** Completed
**Priority:** Medium

## Description

There are 8 `eslint-disable-next-line react-hooks/exhaustive-deps` suppressions across the codebase. These often hide stale closure bugs where a `useEffect` does not re-run when its dependencies change, causing subtle data inconsistencies. Each suppression needs to be audited and either justified with a code comment or refactored away.

## Files to Audit

- `src/components/story-writer/RelatedStoriesPanel.tsx:190`
- `src/hooks/useWorkspaceTask.ts:244`
- `src/components/story-writer/panes/apps/DraftPreviewApp.tsx:58`
- `src/hooks/useLocalStorage.ts:25`
- `src/hooks/useStakeholderAnalysis.ts:86` and `:223`
- `src/components/shared/StoryWriterLauncherModal.tsx:483`
- `src/components/story-writer/StoryWriterLayout.tsx:53`
- `src/app/(app)/stakeholder/page.tsx:378`

## Implementation Plan

1. **RelatedStoriesPanel.tsx:191** - Add `jiraKey` to deps array. Component remounts via `key` prop anyway, so this is a no-op in practice but strictly correct.
2. **useWorkspaceTask.ts:242** - Add `safeSetState` and `eventSourceRef` to deps. All missing deps are stable (module-level functions/refs/stable callbacks). `attachStreamListeners` and `workspaceTasksApi` are module-level so not React deps.
3. **DraftPreviewApp.tsx:58** - Wrap `handleOpenDiff` and `handleAcceptDraft` in `useCallback`, add them to effect deps. Note: `pane` is not memoized so handlers will change on each PaneProvider render, but toolbar re-registration is idempotent.
4. **useLocalStorage.ts:25 + useSessionStorage.ts:26** - Capture `defaultValue` in a `useRef`, use `defaultValueRef.current` in the effect body. Prevents infinite loops when callers pass object literals.
5. **useStakeholderAnalysis.ts:83 + :207** (complex, do together) - Add `liveStateRef`, convert `setLive`/`completeAnalysis`/`failAnalysis`/`attachStream` to `useCallback`. Move definitions above the recovery effect. Replace `liveState[type].status` reads with `liveStateRef.current[type].status`.
6. **StoryWriterLauncherModal.tsx:465** - Change `[mode, sessions.length > 0]` to `[mode, sessions]`. The boolean expression in deps is non-standard; using `sessions` is correct.
7. **StoryWriterLayout.tsx:55** - Add `pane` to deps. Pane operations are idempotent so extra runs are harmless.
8. **stakeholder/page.tsx:379** - Wrap `updateUrl` in `useCallback([isCompareMode, router])`, add to effect deps.

Implementation order: items 1-2-4-6-7 (trivial/independent), then 8 and 3 (standalone useCallback wraps), then 5 (complex stakeholder refactor).

## Acceptance Criteria

- [x] Audit each suppression to determine if it hides a real bug or is a safe intentional omission
- [x] Refactor with useCallback, useRef, or useEffectEvent pattern where needed
- [x] Remove all eslint-disable comments
- [x] Verify no behavioral regressions (manual test each affected component)
- [x] All existing tests still pass
