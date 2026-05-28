# BRDG-220: Split Large Page Components

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

Three page components exceed 1.000 lines and mix layout, data fetching, and feature logic. Splitting them reduces the chance of unintended side effects when making changes.

| Page | Lines | Concerns |
|------|-------|----------|
| `stakeholder/page.tsx` | 1.042 | Sprint cards, health metrics, velocity sparklines, AI briefing, export |
| `refinement/[sessionId]/session/[ticketKey]/page.tsx` | 1.036 | Zoom controls, story points, session panel, subtasks, chat pane |
| `tickets/[key]/page.tsx` | 1.031 | Sidebar metadata, description editor, subtasks, links, reviews, chat |

Additionally `StoryDiff.tsx` (957 lines) is the largest remaining component.

## Approach

Per page:
1. Extract distinct sections into focused child components
2. Extract data fetching/state logic into custom hooks where beneficial
3. Target: page files under 300 lines, acting as layout orchestrators

## Implementation Plan

1. **StoryDiff.tsx** (lowest risk, self-contained, good test coverage)
   - Extract `HunkActionBar` + `decisionStyles` + types into `src/components/story-diff/HunkActionBar.tsx`
   - Extract `HunkEditor` into `src/components/story-diff/HunkEditor.tsx`
   - Extract `CollapsedBar` into `src/components/story-diff/CollapsedBar.tsx`
   - Keep algorithm functions and main component in `StoryDiff.tsx`

2. **stakeholder/page.tsx**
   - Extract AI drawer (GeneratePrompt, drawer JSX, resize logic) into `src/components/stakeholder/StakeholderBriefing.tsx`
   - Extract `AnalysisButton` into `src/components/stakeholder/AnalysisButton.tsx`
   - Extract main content grid (sprint cards, compare mode, carry-over) into `src/components/stakeholder/StakeholderSprintCards.tsx`
   - Extract `OverflowMenu` into `src/components/stakeholder/StakeholderOverflowMenu.tsx` (export utilities already in `stakeholder-data.ts`)
   - Move helper hooks (`usePreviousSprintTickets`, `useCarryOver`) to `src/hooks/useStakeholderHelpers.ts`
   - Move utility functions (`formatRelativeTime`, `extractTeamPrefix`, `extractSprintNumber`) to `src/lib/stakeholder-data.ts`

3. **refinement session page**
   - Extract top bar into `src/components/refinement-session/SessionTopBar.tsx`
   - Extract center navigation (progress, prev/next, queue dropdown) into `src/components/refinement-session/SessionNavigation.tsx`
   - Rename inline `SortableQueueItem` to `SessionQueueItem` (distinct from existing `SortableQueueItem.tsx`)
   - Extract `SubtasksPaneResizable` into its own file

4. **tickets/[key]/page.tsx**
   - Extract data fetching + all handler callbacks into `src/hooks/useTicketDetailPage.ts`
   - Extract tab bar + tab content rendering into `src/components/ticket-detail/TicketTabContent.tsx`

5. **Final validation**: full test suite, build, line-count verification

## Checklist

### stakeholder/page.tsx
- [ ] Extract AI briefing section into `StakeholderBriefing` component
- [ ] Extract sprint card grid into `StakeholderSprintCards` component
- [ ] Extract export logic into utility

### refinement session page
- [ ] Extract session metadata panel into component
- [ ] Extract zoom/navigation controls into component

### tickets/[key]/page.tsx
- [ ] Extract tab/pane orchestration into component
- [ ] Extract data fetching into hook

### StoryDiff.tsx
- [x] Extract hunk rendering into `DiffHunk` component
- [x] Extract accept/reject toolbar into component

- [ ] All existing tests pass after each split
