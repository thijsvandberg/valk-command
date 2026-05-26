# BRDG-186: Epic Child Issues Table Improvements

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want the child issues block on epics to be more informative and configurable, so I can see relevant metadata (story points, sprint, subtask count) at a glance and toggle which columns are visible, just like the subtask filter in refinement sessions.

## Acceptance Criteria

### 1. Unified filter/visibility popover
- [ ] Add a filter button (funnel icon) to the child issues section header, matching the subtask filter popover design in `SubtasksSection`
- [ ] The popover contains:
  - Status filter (All / To Do / In Progress / Done) with counts
  - Toggle switches for field visibility: issue key, assignee, status, story points, sprint, subtask count
- [ ] Remove the current inline status filter tabs (All / To Do) and move them into the popover
- [ ] Default visibility for epics: assignee hidden, all other fields visible
- [ ] Visibility preferences are persisted per user (use the existing settings API pattern)

### 2. Additional table columns
- [ ] Add a **story points** column showing the point estimate for each child issue
- [ ] Add a **subtask count** column showing how many subtasks each child issue has (e.g. "3" or "0")
- [ ] Add a **sprint** column showing the sprint name the child issue belongs to

### 3. Integrate "Choose existing" into the create row
- [ ] Merge the "Choose existing" link into the "Create child issue" input row
- [ ] Add a search icon or toggle in the create row that switches between create mode and search/link mode
- [ ] Remove the separate "Choose existing" link below the list

### 4. Align "Create child issue" input with content
- [ ] The "Create child issue..." placeholder text and type dropdown should align with the title column of the child issues above it, not be offset to the left

### 5. Shared filter popover component
- [ ] Extract the filter popover pattern from `SubtasksSection` into a shared component that both `SubtasksSection` and `EpicChildrenSection` can use
- [ ] Both sections should accept configurable toggle options (which fields can be shown/hidden)
- [ ] Ensure consistent look and behavior across both sections

## Technical Notes

- The existing filter popover lives inside `SubtasksSection.tsx` (the `FilterPopover` inner component around line 137)
- Extract it to a shared component, e.g. `src/components/ticket-detail/FieldFilterPopover.tsx`
- For persistence, use the existing settings API pattern (`/api/settings/`); store per-section visibility preferences (keyed by section: `epic-children`, `subtasks`)
- `EpicChildrenSection.tsx` currently has inline status filter tabs and a separate `searchMode` toggle; refactor to unify
- The epic children API response should already include `storyPoints`, `subtasks` (or count), and `sprint`; verify and extend the API if needed
- Subtask count may need a count field in the child issues response from Jira or a derived count from the local DB

## Dependencies

- Existing `SubtasksSection` filter popover pattern (BRDG-173/BRDG-181)
- Settings persistence API (`/api/settings/`)
