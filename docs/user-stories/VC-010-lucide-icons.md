# VC-010: Migrate to Lucide Icons

**Status:** Open
**Priority:** Low

## Description

Replace all hand-coded inline SVG icons with [Lucide React](https://lucide.dev/) for consistency, maintainability, and a professional icon set across the entire app.

## Why

- Currently all icons are custom inline SVGs, leading to inconsistent sizing, stroke widths, and visual weight
- Adding new icons requires manual SVG creation each time
- Lucide is lightweight (tree-shakeable), MIT-licensed, and has 1500+ icons
- Consistent 24x24 grid with uniform stroke width across all icons

## Scope

### Install

- [ ] `npm install lucide-react`

### Sprint Board icons

- [ ] SprintSlots: refresh, add slot, sprint list
- [ ] FilterBar: dropdown chevrons, sort, column toggle
- [ ] TicketTable: issue type icons, expand row, PO status icons
- [ ] BulkActionBar: clear, refresh, review
- [ ] SidePanel: sync ticket, open in Jira (use `ExternalLink` or custom Jira mark), expand/collapse, open new tab, close
- [ ] SprintListModal: search, close, sync, pin/unpin, status dots (keep custom)
- [ ] SprintAnalytics: collapse chevron

### Sidebar / Layout

- [ ] Navigation icons (dashboard, chat, sprint board, test center, refinement, jobs, stakeholder, changelog)
- [ ] Sidebar collapse/expand

### Other views

- [ ] Chat page icons
- [ ] Jobs page icons
- [ ] Ticket detail page icons

### Special cases

- [ ] Jira logo mark: keep as custom SVG (brand icon, not in Lucide)
- [ ] Issue type icons (bug, story, task, subtask): evaluate if Lucide alternatives work or keep custom

## Acceptance Criteria

- [ ] All inline SVGs replaced with Lucide components (except brand marks)
- [ ] Consistent icon sizing: `h-4 w-4` for standard, `h-3.5 w-3.5` for compact areas
- [ ] No visual regressions: icons match the intended purpose and style
- [ ] Bundle size impact verified (should be minimal with tree-shaking)
- [ ] All tests still pass
