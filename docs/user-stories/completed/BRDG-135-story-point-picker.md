# BRDG-135: Inline Story Point Picker

**Status:** Open
**Priority:** High

## Description

As the PO, I want to click on a ticket's SP cell (on the Sprint Board and in the ticket detail/side panel) to set or change the story points via a popover picker, similar to the existing Business Value picker. Changes must sync bidirectionally with Jira.

## Implementation Plan

1. **SP color system** in `types/ticket.ts` - add `SP_COLORS` map + `getSpColor()`
2. **StoryPointPicker component** in `shared/StoryPointPicker.tsx` - portal popover with presets [1,2,3,5,8], N/A (0), custom input, keyboard support
3. **Extend PATCH `/api/tickets/[key]`** - accept `{ storyPoints }`, update DB + push to Jira via `STORY_POINTS_FIELD`
4. **API client method** - `tickets.updateStoryPoints()` in `api-client.ts`
5. **`saveStoryPoints` utility** in `sprint-board-utils.ts` - optimistic SWR updates + error rollback
6. **Wire into TicketRow** - replace read-only SP cell, add `onStoryPointsChange` prop
7. **Wire callbacks** in `SprintBoard.tsx` + `MultiSprintView.tsx`
8. **Wire into TicketSidebar** - replace read-only SP display with picker
9. **Fix SP total calculations** - `SprintAnalytics.tsx`, `GroupStatBar.tsx` to properly exclude value `0`
10. **Verify Jira inbound sync** - existing `upsert-issue.ts` already handles correctly

## Acceptance Criteria

### Phase 1: StoryPointPicker component
- [x] Create `StoryPointPicker` component, modeled after `BusinessValuePicker`
- [x] Preset options: `-` (dash/N/A), `1`, `2`, `3`, `5`, `8`
- [x] "Custom" option that opens a small number input for arbitrary values (e.g. 13, 21)
- [x] `-` (value `0`) means "this ticket has no SP and should not count toward totals"
- [x] `null` (unset) means "not yet estimated"
- [x] Keyboard support: press `1`/`2`/`3`/`5`/`8` to select, `-` or `0` for N/A, `Escape` to close, `Backspace`/`Delete` to clear
- [x] Color scale similar to BV picker (subtle warm gradient from low to high)
- [x] Active value shows a highlighted/selected state

### Phase 2: Sprint Board integration
- [x] Replace the current read-only SP cell in `TicketRow` with `StoryPointPicker`
- [x] Clicking the SP cell opens the picker popover
- [x] Optimistic UI update on selection (instant visual change)
- [x] On error: revert to previous value and show toast

### Phase 3: Ticket detail / side panel integration
- [x] Add `StoryPointPicker` to the ticket sidebar (similar to where BV is shown)
- [x] Same behavior as on the Sprint Board

### Phase 4: Jira bidirectional sync
- [x] On SP change in Bridge: update local DB immediately, then push to Jira via `jiraClient.updateIssue(key, { [STORY_POINTS_FIELD]: value })`
- [x] On Jira sync (inbound): SP changes from Jira overwrite the local value (Jira is source of truth for SP)
- [x] The `-` (N/A / value `0`) is a Bridge-only concept; when pushing to Jira, send `null` to clear the SP field
- [x] When Jira sets a numeric SP, it should display correctly in Bridge

### Phase 5: Totals and calculations
- [x] Sprint total SP calculations should exclude tickets with `-` (value `0`)
- [x] Tickets with `null` (unset) SP should also not count toward totals (current behavior)
- [x] Burnup chart and velocity calculations should respect the new `-` distinction

## Technical Notes

- Reuse the popover pattern from `BusinessValuePicker` (portal-based, repositioning on scroll, click-outside to close)
- Jira story points field: `customfield_11909` (already defined as `STORY_POINTS_FIELD` in `jira-client.ts`)
- `jiraClient.updateIssue()` already exists and can push arbitrary fields
- Story points are stored as `real("story_points")` in the `ticket` table (schema.ts)
- The existing ticket PATCH API (`/api/tickets/[key]`) already returns `storyPoints` in the response
- Consider adding a new PATCH endpoint or extending the existing one to handle SP updates + Jira push in one call
- Color helper: create `getSpColor(value)` similar to `getBvColor(value)` in `types/ticket.ts`

## Out of Scope
- Bulk SP editing across multiple tickets
- Planning poker / team estimation workflow
- SP history tracking (beyond what Jira changelog provides)
