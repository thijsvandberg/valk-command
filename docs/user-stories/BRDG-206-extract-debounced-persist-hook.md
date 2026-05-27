# BRDG-206: Extract useDebouncedPersist Hook

**Status:** Not Started
**Priority:** Low
**Type:** Refactoring

## Description

As a developer, I want a shared `useDebouncedPersist` hook so that the identical debounce-then-save-to-API pattern used in 3 hooks is not duplicated.

Three hooks follow the exact same pattern:
1. Immediate state update
2. Clear existing debounce timer
3. Set new 500ms timer
4. Call `settingsApi.save*()` on timeout

| Hook | Persists To |
|------|-------------|
| `useColumnConfig` | `settingsApi.saveColumnConfig()` |
| `useColumnWidths` | `settingsApi.saveColumnWidths()` |
| `useSectionVisibility` | `settingsApi.saveSectionVisibility()` |

Additionally, `useSidebarState` reimplements localStorage read/write instead of using the existing `useLocalStorage` hook.

## Implementation Plan

The three API-backed hooks share an identical debounce+timer+cleanup pattern, but their state types and load logic differ significantly. Rather than a full `useDebouncedPersist<T>` wrapper (which would need awkward composite types for `useColumnConfig`'s two-argument persist), the plan extracts the existing `useDebouncedCallback` from `useSprintBoard.ts` into its own file and uses it to replace the duplicated timer/ref/cleanup code in all three hooks.

1. **Extract `useDebouncedCallback`** into `src/hooks/useDebouncedCallback.ts` (already exists in `useSprintBoard.ts`). Move its tests to `useDebouncedCallback.test.ts`. Re-export from `useSprintBoard.ts` for backward compat.
2. **Refactor `useColumnWidths`** to use `useDebouncedCallback` (remove `saveTimer` ref, manual `persist` callback, cleanup effect).
3. **Refactor `useSectionVisibility`** to use `useDebouncedCallback` (same pattern removal).
4. **Refactor `useColumnConfig`** to use `useDebouncedCallback` (two-argument persist works because the hook is generic over `A extends unknown[]`).
5. **Refactor `useSidebarState`** to use `useLocalStorage` internally (remove private `readLocalStorage`/`writeLocalStorage` helpers, replace with `useLocalStorage` hook).
6. **Run full test suite** to verify no regressions.

## Checklist

- [x] Create `useDebouncedPersist<T>(key, initial, persistFn, delayMs?)` hook
- [ ] Refactor `useColumnConfig` to use it
- [ ] Refactor `useColumnWidths` to use it
- [ ] Refactor `useSectionVisibility` to use it
- [ ] Refactor `useSidebarState` to use `useLocalStorage` internally
- [ ] All existing tests pass
