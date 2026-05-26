# BRDG-188: Label Picker on Ticket Sidebar

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want to select labels on a ticket from the existing Jira labels, so I can categorize tickets without leaving Bridge.

## Acceptance Criteria

### 1. Label picker component
- [ ] Add a `LabelPicker` component following the same pattern as `EpicPicker` / `AssigneePicker` (portal popover, search, click-outside-to-close)
- [ ] Clicking the labels row in the sidebar "More" section opens the picker
- [ ] The picker fetches available labels from a new API endpoint
- [ ] Labels are searchable by typing in the search input
- [ ] Selected labels are shown with a checkmark; clicking toggles them on/off (multi-select)
- [ ] Changes are persisted to Jira immediately on toggle (optimistic UI with rollback on error)

### 2. API: fetch available labels
- [ ] New endpoint `GET /api/jira/labels` that returns all labels from the Jira project
- [ ] Uses the Jira REST API `GET /rest/api/3/label` (paginated, return all)
- [ ] Response shape: `{ labels: string[] }`
- [ ] Cache with SWR `dedupingInterval` (60s) on the client side

### 3. API: update ticket labels
- [ ] Extend the existing `PATCH /api/tickets/[key]` route to accept a `labels` field
- [ ] Calls the Jira REST API to update labels on the issue (`PUT /rest/api/3/issue/{key}` with `fields.labels`)
- [ ] Updates the local DB row after successful Jira write

### 4. Sidebar integration
- [ ] Replace the static `Tag` display in the "More" section with the `LabelPicker`
- [ ] When no labels are set, show "None" as clickable text that opens the picker
- [ ] When labels exist, show them as `Tag` chips; clicking the row opens the picker

## Technical Notes

- Follow the `AssigneePicker` pattern: trigger button, portal popover with `createPortal`, search input, list of options with checkmarks
- Key difference: multi-select (toggle individual labels) instead of single-select
- Jira labels API: `GET /rest/api/3/label` returns `{ values: string[], total: number }`
- Jira update: `PUT /rest/api/3/issue/{key}` with body `{ fields: { labels: ["label1", "label2"] } }`
- Store labels in the local DB as JSON array string (existing pattern in `schema.ts`)
- Component file: `src/components/shared/LabelPicker.tsx`
- Test file: `src/components/shared/LabelPicker.test.tsx`

## Out of Scope

- Creating new labels (only selecting from existing ones)
- Label management / deletion
- Label colors or categories
- Bulk label editing across multiple tickets

## Dependencies

None
