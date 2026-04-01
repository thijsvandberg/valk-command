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
- [x] Rich editor Toolbar: List, ListOrdered, Code2, Link, ChevronDown, Info (callout)

### Special cases

- [x] Jira logo mark: keep as custom SVG (brand icon, not in Lucide)
- [x] Issue type icons: CheckSquare (task), Bug (bug), Bookmark (story), SquareMinus (subtask)
- [x] Priority icons: ChevronsUp (Highest), ChevronUp (High), Minus (Medium), ChevronDown (Low), ChevronsDown (Lowest)
- [x] Callout icon: replaced with Info

## Acceptance Criteria

- [x] All inline SVGs replaced with Lucide components (only Jira logo mark remains custom)
- [x] Consistent icon sizing: `h-4 w-4` for standard, `h-3.5 w-3.5` for compact areas
- [x] No visual regressions: icons match the intended purpose and style
- [x] Bundle size impact verified (tree-shaking keeps only used icons)
- [x] All tests still pass
