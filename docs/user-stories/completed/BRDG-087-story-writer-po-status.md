# BRDG-087: Story Writer — PO Status in Header

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to see and change the PO status directly from the Story Writer header so I don't have to go back to the sprint board, and so the app can nudge me to update it after a session ends.

## Implementation Plan

1. Add local `poStatus` state + `handlePoStatusChange` to `StoryWriterLayout.tsx` — optimistic update via `PUT /api/tickets/${key}/metadata`, then `mutateTicket()`.
2. Add `POStatusCell` (icon-only) to the `ViewHeader` children after the title, separated by a `ViewHeaderDivider`. Import from `@/components/sprint-board/TicketTableCells`.
3. Refactor `handleDelete` to not navigate immediately. Instead set `showRefinePrompt(true)` after session deletion, storing which delete option was used.
4. Add refine-prompt modal (second step): "Set PO status to Klaar voor refinement?" with "Yes, set to Refine" and "Skip" buttons. Both navigate back after responding.
5. Ensure "Discard draft" in the more-menu follows the same refine-prompt flow (it calls `handleDelete`, so it gets it for free).

## Acceptance Criteria

### 1. PO status icon in the header bar

- [x] Add an icon-only PO status indicator to the story writer header bar, placed near the ticket key/title area
- [x] Each PO status has a distinct icon and color (e.g. checkmark for "Ready", clock for "In Review", warning for "Needs Work")
- [x] Clicking the icon opens a compact inline popover or dropdown to change the status
- [x] The popover shows all available PO statuses, each with its icon and label
- [x] Selecting a status saves it immediately (same mechanism as the sprint board)
- [x] No full page reload required; optimistic update is acceptable

### 2. Suggest "To Refine" after clearing a session

- [x] After the user confirms a clear/delete session action, show a small inline prompt (toast, banner, or confirmation step) asking if they want to set the PO status to "To Refine"
- [x] The suggestion includes a one-click confirm and a dismiss option
- [x] If confirmed, the PO status is updated immediately (same mechanism as item 1)
- [x] If dismissed, no status change is made

## Technical Notes

- Reuse the PO status values and icons already used on the sprint board
- The popover/dropdown should match the visual style of other compact dropdowns in the app
- Delete/clear session trigger point: check `StoryWriterLayout.tsx` or the hook that handles session deletion
