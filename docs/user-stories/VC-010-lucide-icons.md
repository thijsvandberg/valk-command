# VC-010: Migrate to Lucide Icons

**Status:** Done
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

- [x] `npm install lucide-react`

### Sprint Board icons

- [x] SprintSlots: refresh, add slot, sprint list
- [x] FilterBar: dropdown chevrons, sort, column toggle
- [x] TicketTable: issue type icons, expand row, PO status icons
- [x] BulkActionBar: clear, refresh, review
- [x] SidePanel: sync ticket, open in Jira (ExternalLink), expand/collapse, open new tab, close
- [x] SprintListModal: search, close, sync, pin/unpin, status dots (keep custom)
- [x] SprintAnalytics: collapse chevron

### Sidebar / Layout

- [x] Navigation icons (dashboard, chat, sprint board, test center, refinement, jobs, stakeholder, changelog)
- [x] Sidebar collapse/expand

### Other views

- [x] Chat page icons (MessageCircle, Plus, Trash2, Loader2, SendHorizontal, X)
- [x] Jobs page icons
- [x] Ticket detail page icons

### Shared components

- [x] Avatar: User icon
- [x] StoryDiffPanel: ChevronLeft back button
- [x] Rich editor Toolbar: List, ListOrdered, Code2, Link, ChevronDown (kept CalloutIcon custom)

### Special cases

- [x] Jira logo mark: keep as custom SVG (brand icon, not in Lucide)
- [x] Issue type icons (bug, story, task, subtask): kept as custom SVGs (Jira-specific visual language)

## Remaining custom SVGs (intentionally kept)

6 inline SVGs remain in the codebase. These have no suitable lucide-react equivalent and are kept as custom SVGs by design.

| Icon | File | Line | Reason |
|------|------|------|--------|
| PriorityIcon | `src/app/(app)/tickets/[key]/page.tsx` | 66 | Dynamic arrow direction (up/down/dash) and color per priority level (Highest, High, Medium, Low, Lowest). No single lucide icon covers this. |
| IssueTypeIcon (story) | `src/components/shared/IssueTypeIcon.tsx` | 8 | Bookmark shape matching Jira's story icon, colored `#4a90d9`. |
| IssueTypeIcon (bug) | `src/components/shared/IssueTypeIcon.tsx` | 15 | Filled circle matching Jira's bug icon, colored `#e5534b`. |
| IssueTypeIcon (task) | `src/components/shared/IssueTypeIcon.tsx` | 22 | Checkmark-in-square matching Jira's task icon, colored `#4aaa60`. |
| IssueTypeIcon (subtask) | `src/components/shared/IssueTypeIcon.tsx` | 29 | Nested square matching Jira's subtask icon, colored `#4a90d9`. |
| CalloutIcon | `src/components/rich-editor/Toolbar.tsx` | 249 | Rectangle with left accent border + info dot representing a callout/admonition block. No lucide equivalent. |

## Acceptance Criteria

- [x] All inline SVGs replaced with Lucide components (except brand marks, issue types, priority arrows, callout icon)
- [x] Consistent icon sizing: `h-4 w-4` for standard, `h-3.5 w-3.5` for compact areas
- [x] No visual regressions: icons match the intended purpose and style
- [x] Bundle size impact verified (tree-shaking keeps only used icons)
- [x] All tests still pass
