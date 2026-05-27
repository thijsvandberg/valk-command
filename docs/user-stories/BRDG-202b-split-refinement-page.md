# BRDG-202b: Split RefinementPageContent Component

**Status:** Not Started
**Priority:** High
**Type:** Refactoring
**Parent:** BRDG-202

## Description

`RefinementPageContent.tsx` is 1,294 lines and mixes session management, filtering, resizable panes, and story queue navigation in a single file.

## Checklist

- [ ] Extract resizable pane logic into a reusable hook or component
- [ ] Extract session filter UI into `RefinementFilters` component
- [ ] Extract story queue management into `useRefinementQueue` hook
- [ ] Verify `RefinementPageContent.tsx` is under 300 lines after refactor
- [ ] All existing refinement tests pass
