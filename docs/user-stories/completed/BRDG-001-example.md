# BRDG-001: App Shell and Navigation

**Status:** Not Started
**Priority:** High

## Description

As a user, I want a persistent app shell with sidebar navigation so I can switch between the different views of the command center.

## Acceptance Criteria

- [ ] Sidebar with navigation links to: Dashboard, Chat, Sprint Board, Test Center, Refinement, Jobs, Stakeholder
- [ ] Active route is visually highlighted
- [ ] Sidebar is collapsible (icon-only mode)
- [ ] Main content area renders the selected view
- [ ] Mobile: sidebar becomes a slide-out drawer
- [ ] App shell persists across route changes (no full page reload)

## Technical Notes

- Use Next.js App Router layout for the shell
- Sidebar component in `src/components/layout/`
- Route structure: `/dashboard`, `/chat`, `/board`, `/tests`, `/refinement`, `/jobs`, `/stakeholder`

## Dependencies

None (first feature after scaffold)
