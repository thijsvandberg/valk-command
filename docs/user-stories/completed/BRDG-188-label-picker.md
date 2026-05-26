# BRDG-188: Label Picker on Ticket Sidebar

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to select labels on a ticket from the existing Jira labels, so I can categorize tickets without leaving Bridge.

## Implementation Plan

1. **GET /api/jira/labels endpoint** - Add `getLabels()` to `JiraClient` (paginate `GET /rest/api/3/label`), create `src/app/api/jira/labels/route.ts` returning `{ labels: string[] }`
2. **Extend PATCH /api/tickets/[key]** - Add `body.labels` handler after `body.flagged`: validate array of strings, update local DB (`JSON.stringify`), fire-and-forget Jira sync via `updateIssue(key, { labels })`, log activity
3. **Add `updateLabels` to api-client** - New method in `tickets` namespace in `src/lib/api-client.ts`
4. **Create LabelPicker component** - `src/components/shared/LabelPicker.tsx` following `AssigneePicker` pattern: portal popover, search, click-outside. Key difference: multi-select (popover stays open on toggle)
5. **Sidebar integration** - Replace static labels `DetailRow` in `TicketSidebar.tsx` "More" section with `LabelPicker`, add optimistic state + rollback handler
6. **Tests** - `src/components/shared/LabelPicker.test.tsx` covering: empty state, label chips, popover open, search filter, checkmark toggle, multi-select behavior

**Order:** Steps 1-3 are independent, then 4, then 5. Tests in step 6 alongside step 4-5.

## Acceptance Criteria

### 1. Label picker component
- [x] Add a `LabelPicker` component following the same pattern as `EpicPicker` / `AssigneePicker` (portal popover, search, click-outside-to-close)
- [x] Clicking the labels row in the sidebar "More" section opens the picker
- [x] The picker fetches available labels from a new API endpoint
- [x] Labels are searchable by typing in the search input
- [x] Selected labels are shown with a checkmark; clicking toggles them on/off (multi-select)
- [x] Changes are persisted to Jira immediately on toggle (optimistic UI with rollback on error)

### 2. API: fetch available labels
- [x] New endpoint `GET /api/jira/labels` that returns all labels from the Jira project
- [x] Uses the Jira REST API `GET /rest/api/3/label` (paginated, return all)
- [x] Response shape: `{ labels: string[] }`
- [x] Cache with SWR `dedupingInterval` (60s) on the client side

### 3. API: update ticket labels
- [x] Extend the existing `PATCH /api/tickets/[key]` route to accept a `labels` field
- [x] Calls the Jira REST API to update labels on the issue (`PUT /rest/api/3/issue/{key}` with `fields.labels`)
- [x] Updates the local DB row after successful Jira write

### 4. Sidebar integration
- [x] Replace the static `Tag` display in the "More" section with the `LabelPicker`
- [x] When no labels are set, show "None" as clickable text that opens the picker
- [x] When labels exist, show them as `Tag` chips; clicking the row opens the picker

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
