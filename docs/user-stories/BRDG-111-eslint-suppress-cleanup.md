# BRDG-111: ESLint Suppress Cleanup

**Status:** Open
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

## Acceptance Criteria

- [ ] Audit each suppression to determine if it hides a real bug or is a safe intentional omission
- [ ] Refactor with useCallback, useRef, or useEffectEvent pattern where needed
- [ ] Remove all eslint-disable comments
- [ ] Verify no behavioral regressions (manual test each affected component)
- [ ] All existing tests still pass
