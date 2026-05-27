# BRDG-202: Split Oversized Components

**Status:** Not Started
**Priority:** High
**Type:** Refactoring

## Description

As a developer, I want the largest components broken into smaller, focused pieces so that the codebase is easier to navigate, test, and modify without risking unintended side effects.

Components are split into separate stories where the scope warrants it. Smaller splits are grouped here.

### Separate stories (largest, most complex)
- **BRDG-202a** - SprintBoard (1,466 lines)
- **BRDG-202b** - RefinementPageContent (1,294 lines)
- **BRDG-202c** - SearchModal + FilterBar (1,068 + 874 lines, tightly coupled)

### Grouped in this story (medium-sized, straightforward splits)

| Component | Lines | Concerns Mixed |
|-----------|-------|----------------|
| `MultiSprintView.tsx` | 1,183 | Sprint comparison, date calculations, chart rendering |
| `StoryWriterLayout.tsx` | 935 | Draft sync, toolbar, pane management, hotkeys |
| `StoryWriterLauncherModal.tsx` | 877 | Multi-step modal, ticket selection, preview |

Secondary candidates (500-700 lines):
- `TicketTable.tsx` (697), `SearchResultParts.tsx` (675), `TicketRow.tsx` (623), `SprintStatsPopover.tsx` (578), `NotificationBell.tsx` (547)

## Approach

For each component:
1. Extract state logic into custom hooks
2. Extract sub-sections into focused child components
3. Keep the parent as a layout/orchestration component under ~300 lines

## Implementation Plan

### Phase 1: MultiSprintView (1184 lines)
1. **Extract utils** - Move constants (`COMPARE_*`), `CompareColState`, `loadCompareColumns`, `saveCompareColumns`, `loadSplitRatio`, `saveSplitRatio` to `multi-sprint-utils.ts`
2. **Extract column component** - Move `compareCollisionDetection`, `ColumnResizeHandle`, `PaneDivider`, `DroppableSprintColumn` to `DroppableSprintColumn.tsx`

### Phase 2: StoryWriterLayout (973 lines)
3. **Extract action handlers** - Move ~20 `useCallback` handlers, ~15 `useState` hooks, refs, and effects into `useStoryWriterActions.ts` custom hook
4. **Extract action bar** - Move ViewHeader actions JSX + More Menu dropdown into `StoryWriterActionBar.tsx`
5. **Extract context assembly** - Move `WriterContextValue` assembly into the hook, reducing parent to pure layout (~120 lines)

### Phase 3: StoryWriterLauncherModal (878 lines)
6. **Extract dropdowns** - Move `SprintSelectDropdown` to `shared/SprintSelectDropdown.tsx`, `SessionSelectDropdown` to `shared/SessionSelectDropdown.tsx`
7. **Extract mode content** - Move per-mode content sections to `shared/launcher/NewStoryContent.tsx`, `OpenSessionContent.tsx`, `ExistingStoryContent.tsx`

### Phase 4: Secondary Components
8. **NotificationBell (548 lines)** - Extract utils to `notifications/notification-utils.ts`, `TimeAgo` component, filter bar, and list item into `notifications/` subdirectory
9. **SprintStatsPopover (579 lines)** - Extract `computeWorkingDays` to `sprint-stats-utils.ts`, sub-components to `sprint-stats-parts.tsx`

## Checklist

### Story Writer
- [x] Extract toolbar logic from `StoryWriterLayout.tsx`
- [x] Extract pane management from `StoryWriterLayout.tsx`
- [x] Simplify `StoryWriterLauncherModal.tsx` step logic

### Multi-Sprint
- [x] Extract chart rendering from `MultiSprintView.tsx`
- [x] Extract date calculation logic into utility

### Secondary components
- [x] Review and split `NotificationBell.tsx` (547 lines)
- [ ] Review and split `SprintStatsPopover.tsx` (578 lines)

- [ ] All existing tests pass after each split
