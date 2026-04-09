# BRDG-035: Code Quality - Hook and Component Decomposition

**Status:** Completed
**Priority:** Medium

## Description

Several hooks and components have grown beyond maintainable size. This story covers splitting them into focused, single-responsibility modules to improve readability and testability.

## Scope

### Large Hooks

| Hook | Lines | Proposed Split |
|------|-------|----------------|
| `useStoryWriter.ts` | 722 | Extract into `useStoryWriterSession`, `useStoryWriterMessages`, `useStoryWriterDrafts` |
| `useSprintBoard.ts` | 237 (13 exports) | Group by domain: sprint slots, tickets, reviews, metadata |

### Large Components

| Component | Lines | Proposed Split |
|-----------|-------|----------------|
| `StoryWriterEditor.tsx` | 1,198 | Extract tab content, diff modes, version picker into sub-components |
| `SprintBoard.tsx` | 968 | Extract toolbar, board content, modal orchestration |
| `StoryWriterChat.tsx` | 922 | Extract message list, input area, quick actions |
| `TicketTable.tsx` | 911 | Extract column renderers, sort header, row component |
| `SearchModal.tsx` | 885 | Extract result list, filter bar, keyboard navigation |

## Acceptance Criteria

- [x] No hook file exceeds 300 lines
- [x] No component file exceeds 500 lines
- [x] All existing tests still pass after splitting
- [x] No behavioral changes (pure refactor)
- [x] Import paths updated across the codebase

## Notes

This is a pure refactor. No functional changes. Each split can be done as an independent PR to keep reviews manageable.
