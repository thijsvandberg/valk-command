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

## Checklist

### Story Writer
- [ ] Extract toolbar logic from `StoryWriterLayout.tsx`
- [ ] Extract pane management from `StoryWriterLayout.tsx`
- [ ] Simplify `StoryWriterLauncherModal.tsx` step logic

### Multi-Sprint
- [ ] Extract chart rendering from `MultiSprintView.tsx`
- [ ] Extract date calculation logic into utility

### Secondary components
- [ ] Review and split `NotificationBell.tsx` (547 lines)
- [ ] Review and split `SprintStatsPopover.tsx` (578 lines)

- [ ] All existing tests pass after each split
