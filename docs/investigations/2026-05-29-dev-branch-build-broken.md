# Investigation: `dev` branch build/verify is broken (pre-existing)

**Date:** 2026-05-29
**Found during:** BRDG-233 implementation (Activity Log crash fix)

## Summary

`npm run build` and `npm run verify` fail on the `dev` branch independently of BRDG-233. The working tree was clean before the BRDG-233 work, and the failures live in files unrelated to that story (confirmed via `git status` and `git log`).

## Failures

### 1. ESLint error blocks `npm run build`

`next build` runs ESLint and fails to compile (TypeScript itself reports `Compiled successfully`):

- `src/components/refinement-session/SessionNavigation.tsx:152:61` - `Error: Cannot access refs during render` (reported 4x)

Last touched in commit `64376ab5` ("feat: improve refinement queue dropdown UX"), before BRDG-233.

### 2. `npm run typecheck` errors in test files

`tsc --noEmit` reports type errors, all in pre-existing test files:

- `src/components/sprint-board/TicketTable.test.tsx` (3x) - props missing `onToggleCheck`, `onRangeCheck`, `onToggleAll`, `onPoStatusChange`, `onTableKeyDown`
- `src/components/stakeholder/StakeholderBriefing.test.tsx` - `generate` possibly undefined
- `src/components/story-writer/DiffPane.test.tsx` - `disabled` not on `HTMLElement`
- `src/components/story-writer/panes/PaneContext.test.tsx` - `PaneContextValue` not exported
- `src/components/story-writer/panes/WriterContext.test.tsx` - `Message[]` missing fields
- `src/components/story-writer/RelatedStoriesPanel.test.tsx` - `ticketKey` possibly undefined

## Impact

`npm run verify` (lint + typecheck + tests) and `npm run build` cannot pass on `dev` as-is. Per scope rules these were left untouched during BRDG-233. The Activity Log fix itself compiles cleanly (`tsc` passes for app code) and its targeted test suite passes.

## Recommendation

Address the build/typecheck breakage as a dedicated cleanup story so CI and `npm run verify` are green again on `dev`.
