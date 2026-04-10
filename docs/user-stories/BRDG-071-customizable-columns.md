# BRDG-071: Customizable Sprint Board Columns

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to show/hide and reorder columns on the Sprint Board so I can focus on relevant fields for different workflows (refinement vs. standup vs. review).

## Acceptance Criteria

### Phase 1: Column visibility toggle
- [ ] "Columns" button in the Sprint Board toolbar
- [ ] Dropdown/popover with checklist of all available columns
- [ ] Toggle to show/hide individual columns
- [ ] At least 2 columns must remain visible (key + title minimum)

### Phase 2: Column reorder
- [ ] Drag-and-drop column reorder in the columns popover
- [ ] Updated column order reflected immediately in the table
- [ ] Key column always stays first (cannot be moved)

### Phase 3: Presets
- [ ] Save current column configuration as a named preset
- [ ] Built-in presets: "Default", "Refinement" (key, title, AC present, quality, estimate), "Standup" (key, title, status, assignee), "Review" (key, title, quality, dev info)
- [ ] Switch between presets with one click
- [ ] Custom presets stored in `appSetting` table

### Phase 4: Persistence
- [ ] Column configuration persists across sessions (stored in DB or localStorage)
- [ ] Default configuration for new users shows all columns
- [ ] Reset to default option

## Technical Notes

- Column definitions as a static array with id, label, default visibility, sortable flag
- Persist column config as JSON in appSetting table (reuse existing settings pattern)
- Column widths already persist via existing column-width settings API
- Reorder in popover uses @dnd-kit (already in dependencies)

## Out of Scope (for now)
- Custom columns (user-defined fields)
- Column grouping/nesting
- Column freeze (horizontal scroll with fixed columns)
- Per-sprint column configurations
