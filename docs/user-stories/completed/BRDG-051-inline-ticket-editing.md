# BRDG-051: Inline Ticket Editing on Sprint Board

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to double-click a cell on the Sprint Board to edit story points, PO status, or notes inline so I can make quick updates without opening the side panel.

## Core Concepts

- **Editable cells**: Story points, PO status, PO notes, priority (not Jira fields)
- **Double-click to edit**: Cell transforms into an input/select on double-click
- **Inline editor types**: Number input (points), dropdown (status), text input (notes)
- **Save on blur/Enter**: Changes saved when clicking outside or pressing Enter
- **Cancel on Escape**: Revert changes on Escape key
- **Visual indicator**: Subtle edit icon on hover for editable cells
- **Optimistic update**: UI updates immediately, API call in background

## Acceptance Criteria

### Phase 1: Editable cell detection
- [ ] Define which columns are editable in the Sprint Board column configuration
- [ ] Editable columns: story points, PO status, PO notes, priority
- [ ] Non-editable columns remain as plain read-only cells
- [ ] Editable cells get a `data-editable` attribute for styling and event handling
- [ ] Column configuration stored in a shared constant accessible by cell renderers
- [ ] Each editable column specifies its editor type (number, dropdown, text)

### Phase 2: Double-click to edit
- [ ] Double-clicking an editable cell transitions it to edit mode
- [ ] Story points cell: renders a compact number input (min 0, max 100, step 0.5)
- [ ] PO status cell: renders a dropdown/select with available status options
- [ ] PO notes cell: renders a text input that expands to fit content
- [ ] Priority cell: renders a dropdown with priority levels
- [ ] Edit mode input auto-focuses and selects existing value for quick replacement
- [ ] Only one cell can be in edit mode at a time (editing a new cell closes the previous)

### Phase 3: Save on blur/Enter, cancel on Escape
- [ ] Pressing Enter confirms the edit and saves the new value
- [ ] Clicking outside the active editor (blur) confirms and saves
- [ ] Pressing Escape reverts to the original value and exits edit mode
- [ ] Visual confirmation flash on save (brief green border or background pulse)
- [ ] No save triggered if the value has not changed
- [ ] Dropdown editors commit on selection (no Enter needed)

### Phase 4: Optimistic updates with error rollback
- [ ] UI updates the cell value immediately on save (optimistic update)
- [ ] API call to `/api/tickets/[key]/metadata` fires in the background
- [ ] On API success: SWR cache is revalidated silently
- [ ] On API failure: cell value reverts to original, error toast shown
- [ ] Loading indicator (subtle spinner or border animation) while API call is in-flight
- [ ] Concurrent edits to different cells are handled independently

### Phase 5: Tab navigation between editable cells
- [ ] Pressing Tab while editing moves focus to the next editable cell in the row
- [ ] Shift+Tab moves focus to the previous editable cell in the row
- [ ] Tab at the last editable cell in a row moves to the first editable cell of the next row
- [ ] Tab navigation wraps around the table (last cell to first cell)
- [ ] Tabbing into a cell automatically enters edit mode
- [ ] Focus trap stays within the Sprint Board table when tabbing

### Phase 6: Hover indicators for editable cells
- [ ] Editable cells show a subtle pencil/edit icon on hover (top-right corner of the cell)
- [ ] Icon uses low opacity and does not shift cell content
- [ ] Cursor changes to a text cursor or pointer on editable cells
- [ ] Tooltip on hover: "Double-click to edit"
- [ ] Hover state has a subtle background color shift to indicate interactivity
- [ ] Edit indicators are hidden during print or export

## Technical Notes

- Sprint Board uses `TicketTableCells.tsx` for cell rendering
- Add editable state management per cell using a lightweight context or ref-based approach
- PO metadata updates via existing `/api/tickets/[key]/metadata` endpoint
- Story points update may need a new endpoint or use existing ticket update endpoint
- Tab key behavior requires careful focus management to avoid conflicts with native tab
- Accessibility: editable cells need `role="gridcell"`, `aria-readonly="false"`, and announce state changes

## Out of Scope (for now)

- Bulk inline editing (editing multiple cells at once)
- Formula cells or computed values
- Jira field editing (only PO metadata fields are editable)
- Cell validation rules beyond type constraints
- Undo/redo for inline edits
