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

## Checklist

- [ ] Create `useDebouncedPersist<T>(key, initial, persistFn, delayMs?)` hook
- [ ] Refactor `useColumnConfig` to use it
- [ ] Refactor `useColumnWidths` to use it
- [ ] Refactor `useSectionVisibility` to use it
- [ ] Refactor `useSidebarState` to use `useLocalStorage` internally
- [ ] All existing tests pass
