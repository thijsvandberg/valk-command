# BRDG-212: Multiselect Toolbar Upgrade

**Status:** In Progress
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the Sprint Board multiselect toolbar to have more bulk actions and be organized into logical dropdown groups so that I can efficiently manage multiple tickets without the toolbar overflowing on smaller screens.

Currently the toolbar shows 6+ individual buttons in a flat row, which overflows on smaller screens and lacks common bulk operations like setting status, epic, or assignee.

## Requirements

### 1. Add new bulk actions

Add the following actions to the multiselect toolbar:

- **Set Status** - Bulk update Jira status on selected tickets
- **Add/Update Label** - Bulk add or update labels on selected tickets
- **Set Epic** - Bulk assign an epic to selected tickets
- **Move to Sprint** - Bulk move selected tickets to a different sprint
- **Update Assignee** - Bulk change assignee on selected tickets
- **Generate Subtasks** - AI-generate subtasks for all selected tickets

### 2. Group actions under dropdown menus

Organize all actions into two dropdown groups plus standalone buttons:

| Element | Type | Contains |
|---------|------|----------|
| **Update** | Dropdown | Set Status, Set Readiness, Set Epic, Move to Sprint, Update Assignee, Add/Update Label |
| **AI Assist** | Dropdown | Review Story, Generate Subtasks, Summarized List |
| Copy List | Button | Copy selected tickets to clipboard |
| Refresh from Jira | Button | Sync selected tickets from Jira |
| Add to Refinement | Button (ghost, not primary) | Add selected tickets to refinement session |

### 3. Rename existing actions

- "Refine" -> "Add to Refinement" (demoted from primary/soft button to regular ghost button)
- "Export" -> "Summarized List" (moved into AI Assist dropdown)
- "Copy" -> "Copy List"

### 4. Selection counter shows SP and BV

- Currently the selection counter shows only story points: "3/21 selected · 3 pts"
- Change to show both Story Points and Business Value separately: "3/21 selected · 3 SP · 7 BV"
- Only show each metric if the total is > 0

### 5. Responsive layout

- The toolbar must not overflow or break layout on smaller screens
- Dropdown grouping naturally reduces horizontal space needed (2 dropdowns + 3 buttons instead of 7+ buttons)
- Ensure consistent button sizing and alignment at all viewport widths
- No wrapping or "schots en scheef" layout on narrow screens

## Technical notes

- BulkActionBar component: `src/components/sprint-board/BulkActionBar.tsx`
- SprintBoard integration: `src/components/sprint-board/SprintBoard.tsx`
- Shared bar primitive: `src/components/shared/BarContainer.tsx`
- Dropdown pattern: reuse the existing Readiness dropdown approach (Card variant="floating" with click-outside handler)
- New bulk actions (status, label, epic, sprint, assignee) will need API routes to push changes to Jira

## Out of scope

- Implementing the actual Jira API calls for new bulk actions (can be stubbed/disabled initially if needed)
- Changing the selection mechanism itself
- Modifying the ticket list or table layout

## Implementation Plan

1. **Rename buttons + update counter** (BulkActionBar.tsx, SprintBoard.tsx): Change labels, demote Refine to ghost, add `selectedBV` prop, show "SP" and "BV" separately
2. **Build Update dropdown** (BulkActionBar.tsx): Menu with 6 items. Each item opens the corresponding existing picker (EpicPicker, AssigneePicker, SprintPicker, LabelPicker, status list, readiness list). Reuse Card variant="floating" pattern.
3. **Build AI Assist dropdown** (BulkActionBar.tsx): Menu with 3 items (Review Story, Generate Subtasks, Summarized List). Move existing Review Story and Export callbacks into this dropdown.
4. **Restructure layout**: Checkbox > Counter > Divider > Update dropdown > AI Assist dropdown > Divider > Copy List > Refresh from Jira > spacer > Add to Refinement > Clear
5. **Wire bulk handlers** (SprintBoard.tsx, useTicketActions.ts): Loop existing single-ticket APIs with Promise.all for status/epic/label/assignee. Use existing bulk endpoint for move-sprint. Add bulkGenerateSubtasks in sprint-board-utils.ts.
6. **Responsive**: Ensure no overflow with `overflow-x-auto` or `flex-shrink` on the bar. Labels hide on narrow screens.
7. **Tests + build**: Add BulkActionBar.test.tsx, verify lint/typecheck/tests/build pass.

No new API routes needed. All endpoints exist for single-ticket updates.

## Checklist

- [x] Rename "Refine" to "Add to Refinement", change to ghost variant
- [x] Rename "Export" to "Summarized List"
- [x] Rename "Copy" to "Copy List"
- [x] Create "Update" dropdown with: Set Status, Set Readiness, Set Epic, Move to Sprint, Update Assignee, Add/Update Label
- [x] Create "AI Assist" dropdown with: Review Story, Generate Subtasks, Summarized List
- [x] Keep Copy List, Refresh from Jira, Add to Refinement as standalone buttons
- [x] Implement responsive layout that works on smaller screens without overflow
- [x] Add API routes for new bulk actions (set status, set label, set epic, move to sprint, update assignee) <!-- No new routes needed: existing single-ticket PATCH/PUT endpoints reused with Promise.allSettled -->
- [x] Add Generate Subtasks bulk action (AI-powered)
- [x] Wire up all new actions in SprintBoard.tsx
- [x] Update selection counter to show SP and BV separately ("3 SP · 7 BV")
- [x] All tests pass, build succeeds
