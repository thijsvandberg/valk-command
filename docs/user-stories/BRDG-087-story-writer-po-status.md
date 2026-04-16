# BRDG-087: Story Writer — PO Status in Header

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to see and change the PO status directly from the Story Writer header so I don't have to go back to the sprint board, and so the app can nudge me to update it after a session ends.

## Acceptance Criteria

### 1. PO status icon in the header bar

- [ ] Add an icon-only PO status indicator to the story writer header bar, placed near the ticket key/title area
- [ ] Each PO status has a distinct icon and color (e.g. checkmark for "Ready", clock for "In Review", warning for "Needs Work")
- [ ] Clicking the icon opens a compact inline popover or dropdown to change the status
- [ ] The popover shows all available PO statuses, each with its icon and label
- [ ] Selecting a status saves it immediately (same mechanism as the sprint board)
- [ ] No full page reload required; optimistic update is acceptable

### 2. Suggest "To Refine" after clearing a session

- [ ] After the user confirms a clear/delete session action, show a small inline prompt (toast, banner, or confirmation step) asking if they want to set the PO status to "To Refine"
- [ ] The suggestion includes a one-click confirm and a dismiss option
- [ ] If confirmed, the PO status is updated immediately (same mechanism as item 1)
- [ ] If dismissed, no status change is made

## Technical Notes

- Reuse the PO status values and icons already used on the sprint board
- The popover/dropdown should match the visual style of other compact dropdowns in the app
- Delete/clear session trigger point: check `StoryWriterLayout.tsx` or the hook that handles session deletion
