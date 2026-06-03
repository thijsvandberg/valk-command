# BRDG-260: Side Panel -- Collapsible & Resizable Meta Sidebar

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the meta sidebar inside the Sprint Board side panel to behave like the
one on the full story single view: I can collapse it, resize it, and have it drop below
the content when the panel gets too narrow. My collapse choice and chosen width must be
remembered across sessions.

This builds on BRDG-238, which gave the side panel full single-view parity and a shared
`TicketMetaContent` component. Today the meta sidebar in the panel is a fixed-width column
(`340px`) that only switches to a stacked layout at a hard width threshold; it cannot be
collapsed or resized by the user.

## Requirements

### 1. Resizable meta sidebar (two-column mode)

- When the panel is wide enough to show the meta as a side column, the user can resize that
  column by dragging its left edge (the divider between content and meta), exactly like the
  resize handle on the full ticket page's `TicketSidebar`.
- The chosen meta-column width is persisted and restored on the next session.
- Sensible min/max bounds so neither the content nor the meta becomes unusably narrow.

### 2. Collapsible meta sidebar

- The user can collapse the meta sidebar so the tabbed content uses the full panel width
  (same affordance as the full ticket page: a collapse control on the divider, optionally a
  double-click on the resize handle).
- When collapsed, a small "show sidebar" button appears at the right of the **panel header**
  (next to the existing edit / more / open-full / close controls) to bring it back. See the
  reference image: the button sits in the header action cluster on the right.
- The collapsed state is persisted and restored on the next session.

### 3. Auto-stack when the panel is too narrow

- When the panel is too narrow to comfortably show content + meta side by side, the meta
  drops **below** the content in a single scroll (the existing stacked layout).
- This auto-stack is driven by the actual panel width and the chosen meta width (i.e. there
  is not enough room left for the content column), not a single fixed breakpoint.
- Decide the collapsed-vs-stacked interaction: when the user has collapsed the meta and then
  narrows the panel, the meta should stay hidden (respect the explicit collapse) rather than
  reappearing stacked. Stacking only applies when the meta is *not* collapsed.

### 4. Persistence

- Persist the meta-sidebar **width** and **collapsed** state in `localStorage` under
  panel-specific keys, separate from the full ticket page's keys so the two do not clash.
- Restore both on load.

## Out of scope

- Changes to the full ticket page's `TicketSidebar` behavior (it already collapses/resizes).
- Changes to the panel's own outer width/resize (that already exists and persists under
  `sprintBoardPanelWidth`).
- Changes to `TicketMetaContent`'s fields or layout.

## Technical notes

- Side panel: `src/components/sprint-board/SidePanel.tsx`. It already computes a two-column
  vs stacked layout from `panelWidth` (`TWO_COL_THRESHOLD = 720`) and renders the shared
  `TicketMetaContent` either as a fixed `w-[340px]` column or as `metaContent` stacked under
  the Content tab.
- Reuse the proven shell pattern from `src/components/ticket-detail/TicketSidebar.tsx`: a
  left-edge resize handle (drag to resize, double-click to collapse), a collapse button on
  the divider, `clampedWidth` min/max, and persisted width/collapsed state. Consider
  extracting that shell into a shared component (e.g. `MetaSidebarShell`) so both the full
  page and the panel use one implementation, mirroring how `TicketMetaContent` is already
  shared. Otherwise replicate the small amount of shell logic in the panel.
- New persistence keys, e.g. `sprintBoardMetaWidth` and `sprintBoardMetaCollapsed`
  (distinct from the page's `ticket-sidebar-width` / `ticket-sidebar-collapsed`).
- The "show sidebar" header button mirrors the full page's re-open control (the page uses a
  `PanelRightClose` icon button in its header when the sidebar is collapsed). Place it in the
  panel header's right-hand action cluster.
- Auto-stack: replace the single `TWO_COL_THRESHOLD` check with a computed decision such as
  `panelWidth - metaWidth >= CONTENT_MIN_WIDTH` (and `!collapsed`) to choose column vs stacked.
- Keyboard shortcut: the page uses `[` to toggle its sidebar. Decide whether to add a panel
  shortcut; avoid clashing with existing sprint-board shortcuts. Likely leave it out or use a
  distinct key.

## Checklist

- [ ] Make the meta column resizable via a left-edge drag handle (two-column mode)
- [ ] Persist and restore the meta-column width (`sprintBoardMetaWidth`)
- [ ] Add a collapse control on the divider (drag handle double-click + button)
- [ ] Add a "show sidebar" button in the panel header when collapsed
- [ ] Persist and restore the collapsed state (`sprintBoardMetaCollapsed`)
- [ ] Auto-stack the meta below content when the panel is too narrow (width-driven, respects collapse)
- [ ] Consider extracting a shared `MetaSidebarShell` reused by `TicketSidebar` and `SidePanel`
- [ ] Tests for resize/collapse/persistence and the stacked vs column decision
- [ ] Verify visually at narrow, medium, and wide panel widths, collapsed and expanded
