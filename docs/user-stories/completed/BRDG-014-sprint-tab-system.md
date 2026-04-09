# BRDG-014: Sprint Tab System Fix

**Status:** Done
**Priority:** High

## Description

The sprint board tab system (pin sprints to header, switch between them, remember selection) is fundamentally broken. The PO cannot reliably pin sprints, reorder tabs, or get a consistent default view when opening the sprint board.

## Context

The sprint board header has a tab bar where sprints can be pinned for quick access. A sprint modal (opened via "Sprints" button) allows browsing all sprints from Jira and pinning/unpinning them. The first tab should be the default sprint shown when navigating to `/sprint-board`.

"BT: Next Sprint" is the backlog/todo sprint where new tickets land by default. The PO pins this manually via the sprint modal.

## Current Bugs (observed in browser)

### 1. "+" button does nothing
- `handleAddSlot` pushes a placeholder ID `"next"` into `slotSprints`
- The render loop in `SprintSlots.tsx:175-176` skips unknown IDs (`if (!sprint) return null`)
- Net result: button click has no visible effect

### 2. Pin button in sprint modal does not work
- Console error: `<button>` nested inside `<button>` (invalid HTML)
- The sprint row is a `<button>`, and the pin icon inside it is also a `<button>`
- Click events conflict: outer button's onClick fires instead of (or alongside) pin handler
- Result: clicking pin either does nothing or navigates to the sprint instead of pinning

### 3. SprintListModal.tsx has a syntax error
- Console error at line 196: `Expected '</', got ')'`
- Broken JSX structure prevents the pin button section from rendering correctly

### 4. SidePanel.tsx has a syntax error
- Line 237: `<` without element name (missing `a` tag: `<a href=...` became `< href=...`)
- Causes hydration errors on every page load

### 5. Default tab not working on fresh navigation
- Navigating to `/sprint-board` (no `?sprint=` param) shows empty board momentarily
- Saved sprint slots from DB are NOT restored (only 1 fallback tab appears instead of saved 3)
- The URL sync effect fires before slots load, pushing `?sprint=undefined` or a wrong sprint ID
- Fallback picks first "active" sprint from Jira (sprint 10048) instead of loading saved slot config
- Race condition between `useSprintSlots()` SWR response and the fallback effect

### 6. Active tab visual distinction is too subtle
- Active tab has `bg-[var(--color-surface-base)]` + white text
- Inactive tab has `text-white/40`
- The difference is hard to notice, especially with 3+ tabs

### 7. No drag-and-drop for tab reordering
- @dnd-kit is installed and used for ticket reordering
- Tab reordering is not implemented; tabs are fixed in pin order

## Acceptance Criteria

### Fix "+" button
- [x] "+" button opens the sprint modal (same as "Sprints" button)
- [x] Remove the placeholder `"next"` ID approach entirely

### Fix pin/unpin in sprint modal
- [x] Fix button-inside-button nesting (use `<div role="button">` for row, or move pin outside)
- [x] Fix SprintListModal.tsx syntax error (line 196)
- [x] Pin icon click adds sprint as new tab (max 4)
- [x] Pin icon click on already-pinned sprint removes the tab
- [x] Pinned sprints show a visually distinct pin icon (filled/colored) vs unpinned (outline)
- [x] Pin state persists: changes save to DB via `/api/sprint-slots` PUT

### Fix SidePanel.tsx syntax error
- [x] Restore missing `a` tag on line 237 (was already fixed in current file, error was from SWC cache)

### Fix default tab on page load
- [x] On `/sprint-board` (no query param): load saved slots from DB, activate first slot
- [x] On `/sprint-board?sprint=X`: load saved slots, activate the tab matching sprint X
- [x] Do NOT write to URL until slots are loaded and a valid `activeSprintId` exists
- [x] Fallback to first Jira "active" sprint ONLY if no slots are saved in DB

### Active tab visual distinction
- [x] Active tab: solid background, full opacity text, bottom accent line (brand color)
- [x] Inactive tab: no background, dimmed text, no accent line
- [x] Clear contrast between active and inactive states

### Tab drag-and-drop reordering
- [x] Wrap sprint tabs in @dnd-kit sortable context (horizontal)
- [x] Drag handle or full-tab drag to reorder
- [x] New order persists to DB on drop
- [x] First tab (index 0) = default sprint on page load

## Technical Notes

- @dnd-kit is already a dependency (used for ticket reordering in TicketTable.tsx)
- Sprint slots API (`/api/sprint-slots`) already supports GET and PUT with atomic replace
- `sprint_slot` table schema: `slotIndex`, `sprintId`, `sprintName` (max 4 slots)
- The hydration error (localStorage reads in useState initializers) is a separate issue but worth noting

## Files to Modify

- `src/components/sprint-board/SprintBoard.tsx` (slot loading, URL sync, "+" handler)
- `src/components/sprint-board/SprintSlots.tsx` (tab rendering, DnD, active styling)
- `src/components/sprint-board/SprintListModal.tsx` (fix syntax, fix button nesting)
- `src/components/sprint-board/SidePanel.tsx` (fix missing `a` tag)

## Dependencies

- None (all infrastructure exists)
