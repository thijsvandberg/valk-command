# BRDG-131: Sprint Switcher Redesign

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want a clearer, faster sprint switcher so I can find any sprint without guessing which tab it's in, manage my pinned tabs, and discover sprints that haven't been synced from Jira yet.

## Problem

The current sprint list modal uses tabs (Sprints / History / Hidden) that create search silos. Searching for "135" in the Sprints tab returns nothing because it's a closed sprint, forcing the user to guess which tab to check. Pinned (tab bar) sprints have no dedicated management view, so stale closed sprints linger in the tab bar without explanation.

Adding more tabs (Pinned / Open / Closed / Hidden / All) makes the problem worse: the modal becomes cramped and the user still has to pick the right tab before searching.

## Solution: Search-first sprint switcher

Replace the tab-based modal with a **search-driven switcher** that has two modes:

### Default mode (empty search field)

The list shows grouped sections, no tabs:

| Section | Content | Actions per row |
|---------|---------|-----------------|
| **Pinned** | All sprints currently in the tab bar, with state badge (Active/Future/Closed) | Unpin, Stakeholder |
| **Active & Future** | Non-hidden active + future sprints not already shown in Pinned | Pin, Hide, Stakeholder |
| **Recent closed** | Last 5 closed sprints (not hidden, not pinned). Collapsed by default, expand with "Show closed" | Pin, Hide, Stakeholder |

Each section is collapsible. Hidden sprints are accessible via a small "N hidden" link at the bottom that expands an inline list with Unhide action.

### Search mode (user types in search field)

As soon as the user types, the sections disappear and results become a **flat list across all sprints** (open, closed, hidden, pinned). Each result shows:

- State dot (green/blue/grey)
- Sprint name
- State badge (Active / Future / Closed / Hidden)
- Date range
- Pin/Unpin button

This eliminates the "wrong tab" problem entirely.

### No results: Jira sync fallback

When the search query matches zero local sprints, show:

```
No sprints found for "BT: 140"
[Sync from Jira]  -- syncs both active and closed sprints
```

After sync completes, results auto-refresh. If still nothing, show "No sprints found in Jira either."

### Footer

A persistent "Sync sprints" button at the bottom, with scope indicator:
- In default mode: syncs active + future sprints
- When "Show closed" is expanded: also syncs closed sprints

## Implementation Plan

1. **Section computation helpers** -- `getPinnedSection`, `getActiveFutureSection`, `getRecentClosedSection`, `getHiddenSprints` pure functions at top of file
2. **Restructure component state** -- Replace `tab` state with `search`, `syncing`, `syncError`, `syncDone`, `closedExpanded`
3. **SprintRow sub-component** -- Reusable row with state badge, action buttons (stakeholder, hide/unhide, pin/unpin)
4. **SectionHeader sub-component** -- Heading with optional collapse toggle for Recent closed
5. **Default mode rendering** -- Pinned > Active & Future > Recent closed sections, guarded by `length > 0`
6. **Search mode rendering** -- Flat list across all sprints when search is non-empty
7. **Jira sync fallback** -- Dual-scope sync when search returns 0 results, "No results in Jira either" after sync
8. **Visual polish** -- State badges, filled pin icon, w-96 width, smooth transitions

Files: `SprintListModal.tsx` (rewrite), `SprintBoard.tsx` (no changes needed, props unchanged)

## Acceptance Criteria

### Search behavior
- [x] Empty search shows sectioned view: Pinned, Active & Future, Recent closed
- [x] Typing in search field immediately switches to flat cross-section results
- [x] Search matches against sprint name (case-insensitive, substring match)
- [x] Clearing search restores the sectioned default view

### Sections (default mode)
- [x] Pinned section shows all tab-bar sprints with state badge (Active/Future/Closed)
- [x] Active & Future section excludes sprints already shown in Pinned
- [x] Recent closed section is collapsed by default, shows last 5 closed sprints
- [x] Hidden sprints accessible via "N hidden" link at the bottom
- [x] Sections with 0 items are not rendered

### Sprint row actions
- [x] Pin/Unpin available on every row in every context
- [x] Hide/Unhide available on non-pinned rows (hiding auto-unpins)
- [x] Stakeholder link available on all non-hidden rows
- [x] Clicking a sprint row navigates to it and closes the modal

### Jira sync fallback
- [x] When search has results: no fallback shown
- [x] When search returns 0 results: show "Sync from Jira" inline action
- [x] Sync fetches both active/future and closed sprints from Jira
- [x] After sync, results list auto-refreshes via SWR revalidation
- [x] If still no results after sync: show "No sprints found in Jira either"

### Visual
- [x] Modal width: w-96 (384px)
- [x] State badges use color-coded chips (green=Active, blue=Future, grey=Closed)
- [x] Pinned sprint rows show filled pin icon in brand color
- [x] Smooth transition between sectioned and flat search mode

## Technical Notes

- Replaces `SprintListModal.tsx` component
- No new API endpoints needed; reuses existing `/api/jira/sync-sprints` with both scopes
- SWR revalidation (`mutate()`) refreshes the sprint list after sync
- The current Pinned/Open/Closed/Hidden tab implementation (BRDG tab refactor) should be replaced by this design

## Out of Scope

- Drag-to-reorder pinned sprints within the modal (existing tab bar DnD handles this)
- Sprint detail view or inline editing of sprint properties
- Fuzzy/typo-tolerant search (exact substring match is sufficient)
