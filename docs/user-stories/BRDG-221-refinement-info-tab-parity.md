# BRDG-221: Refinement Info Tab Parity with Ticket Sidebar

**Status:** In Progress
**Priority:** Medium
**Epic:** Refinement

## Context

The Info tab in the refinement session ticket view (`SessionMetadataPanel`) currently shows a basic read-only list of fields (Reporter, Assignee, Priority, Epic, Sprint, Labels, Components, Parent, Created, Updated). The ticket single view sidebar (`TicketSidebar`) is significantly richer: it includes more fields (Status, Story Points, Business Value), uses interactive pickers for editing, and has a more polished layout.

The goal is to bring the refinement Info tab in line with the ticket sidebar so the PO can view and edit all relevant metadata without leaving the refinement session.

## Implementation Plan

1. Extend `SessionMetadataPanel` props to accept `onMutate` callback
2. Add imports for pickers (`StoryPointPicker`, `BusinessValuePicker`, `AssigneePicker`, `EpicPicker`, `LabelPicker`) and `JIRA_STATUS_COLORS`
3. Add `CompactField` helper component (copied from TicketSidebar)
4. Add local state + optimistic-update handlers for all editable fields
5. Rewrite JSX with new field order, pickers, and removals (Priority, Components gone)
6. Update sprint handler to call `onMutate` after success
7. Wire `onMutate` in the parent refinement page
8. Write tests for `SessionMetadataPanel`

**Field order:** Story Points + Business Value (compact top row), Status, Epic, Parent (if subtask), Sprint, Assignee, Reporter, Created, Updated, Labels

**Files touched:**
- `src/components/refinement-session/SessionTicketView.tsx` (primary)
- `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` (wire onMutate)
- `src/components/refinement-session/SessionMetadataPanel.test.tsx` (new test file)

## Requirements

### Add missing fields
- [x] Status (read-only badge, same color-coded styling as sidebar)
- [x] Story Points (editable via `StoryPointPicker`)
- [x] Business Value (editable via `BusinessValuePicker`)

### Remove fields
- [x] Remove Priority (not useful in refinement context)
- [x] Remove Components (not useful in refinement context)

### Make existing fields editable
- [x] Assignee: replace static text with `AssigneePicker` (calls `jira.assign()`)
- [x] Epic: replace static text with `EpicPicker` (calls `tickets.updateEpic()`)
- [x] Labels: replace static badges with `LabelPicker` (calls `tickets.updateLabels()`)
- [x] Sprint: already uses `SprintPicker`, verify it works correctly

### Layout and styling alignment
- [x] Match field order to ticket sidebar: Story Points + Business Value (compact top row), Status, Epic, Sprint, Assignee, Reporter, Created, Updated, Labels
- [x] Use the same row styling and spacing as `TicketSidebar` (label left, value right, consistent padding)
- [x] Ensure interactive fields show appropriate hover/focus states and cursor pointer

### Data flow
- [x] Ensure mutations in the Info tab update the ticket data in the refinement session context (no stale state after edit)
- [x] Optimistic updates with rollback on error, matching sidebar behavior

### Tests
- [x] Test that editable pickers render and trigger correct API calls
- [x] Test that read-only fields (Status, Reporter, Created, Updated) are not interactive

## Technical notes

- Reuse existing picker components: `StoryPointPicker`, `BusinessValuePicker`, `AssigneePicker`, `EpicPicker`, `LabelPicker`
- The `SessionMetadataPanel` lives in `src/components/refinement-session/SessionTicketView.tsx` (lines ~213-326)
- The reference implementation is `src/components/ticket-detail/TicketSidebar.tsx`
- Sprint editing already works via `SprintPicker` in the current Info tab

## Out of scope

- PO Note (already available via separate Notes tab in refinement)
- Readiness indicator / Quality review (not needed during refinement flow)
- Dev Panel / Confluence Pages sections
- "More details" collapsible section
