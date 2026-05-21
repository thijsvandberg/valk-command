# BRDG-148: Sprint Stats Popup

**Status:** Done
**Priority:** Low

## Description

As the PO, I want the sprint statistics overview to be displayed in a popup instead of a tooltip, so there is more room for a richer breakdown including issue types and epics.

Currently hovering over the completion bar in the sprint board header shows a small tooltip with items, SP, BV, and a per-status breakdown. This works but is limited in space and disappears easily. A click-triggered popup (popover) provides more room for additional sections and better formatting.

## Current Behavior

- Tooltip appears on hover over the `SprintCompletionBar` in the header
- Shows: item count, total SP (with avg), total BV (with avg), warning for unestimated tickets
- Per-status breakdown: count + SP + BV per status (DONE, TEST, IN PROGRESS, TO DO)
- Location: `src/components/sprint-board/SprintBoard.tsx` lines ~993-1060

## Implementation Plan

1. **Create `SprintStatsPopover.tsx`** - New component with fixed positioning (pattern from `ReviewPopover`), click-outside + Escape close, max-width 400px. Accept `allTickets` and compute all stats internally.
2. **Port existing tooltip content** into the popover body (items, SP avg, BV avg, unestimated warning, per-status breakdown).
3. **Modify `SprintBoard.tsx`** - Replace `<Tooltip>` with click-to-open popover: add `statsPopoverOpen` state, `completionBarRef`, render `SprintStatsPopover` conditionally. Add `role="button"`, `tabIndex`, `onKeyDown` for accessibility.
4. **Add type breakdown** - `useMemo` aggregation on `t.type` (not `t.issueType`), render rows with `IssueTypeIcon`, count, SP, BV. Exclude DEPRECATED.
5. **Add epic breakdown** - `useMemo` aggregation on `t.epic`, color dots via `getEpicColor()`, sort by SP desc, "No Epic" fallback. Only show if at least one ticket has an epic.
6. **Visual polish** - Section dividers, opacity+scale transition on mount, design tokens consistent with existing components.

**Notes:** The story says `issueType` but the Ticket type uses `type: IssueType`. The mode toggle buttons already call `e.stopPropagation()` so they will not trigger the popover.

## Acceptance Criteria

### Phase 1: Replace tooltip with popover
- [x] Replace the hover tooltip with a click-triggered popover (or panel that opens inline)
- [x] Popover anchors to the completion bar area and has a max-width of ~400px
- [x] Click outside or press Escape closes the popover
- [x] Keep the existing content: items, SP (total + avg), BV (total + avg), per-status breakdown

### Phase 2: Issue type breakdown
- [x] New section: "By Type" showing a breakdown per issue type (Story, Task, Bug, Spike, Subtask)
- [x] Each type row shows: count, total SP, total BV
- [x] Only show types that have at least 1 ticket in the sprint
- [x] Use the `issueType` field from Ticket (`src/types/ticket.ts`) <!-- uses t.type (IssueType), not t.issueType which does not exist on Ticket -->

### Phase 3: Epic breakdown
- [x] New section: "By Epic" showing a breakdown per epic
- [x] Each epic row shows: epic name (with color dot from `getEpicColor`), count, total SP, total BV
- [x] Sort epics by total SP descending
- [x] Tickets without an epic grouped under "No Epic"
- [x] Only show epics section when there are epics in the sprint

### Phase 4: Visual polish
- [x] Sections are visually separated with subtle dividers
- [x] Compact but readable layout using the existing design tokens
- [x] Smooth open/close transition (opacity + scale)
- [x] Popover should not block interaction with the completion bar mode toggle (SP/BV/#)

## Technical Notes

- The tooltip content is inline in `SprintBoard.tsx` (~line 993). Extract the popup into a dedicated `SprintStatsPopover` component
- Ticket data is already available via `allTickets` in the sprint board header render
- `issueType` field is available on each ticket (type `IssueType` in `src/types/ticket.ts`)
- `epic` and `epicKey` fields are on each ticket; use `getEpicColor()` from `src/types/ticket.ts` for color dots
- Consider reusing the popover pattern from `ReviewPopover` or creating a shared popover primitive
- The `SprintAnalytics` component (`SprintAnalytics.tsx`) already does some of this aggregation (by status, by assignee) and could be referenced for patterns

## Out of Scope (for now)

- Assignee breakdown (already exists in SprintAnalytics panel)
- Editable fields in the popup
- Historical comparisons
