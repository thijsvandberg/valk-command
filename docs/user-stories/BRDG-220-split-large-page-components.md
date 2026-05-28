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
- [ ] Extract hunk rendering into `DiffHunk` component
- [ ] Extract accept/reject toolbar into component

- [ ] All existing tests pass after each split
