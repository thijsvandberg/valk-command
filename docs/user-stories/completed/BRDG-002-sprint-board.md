# BRDG-002: Sprint Board

**Status:** Complete
**Priority:** High

## Description

As a PO, I want a sprint backlog view that mirrors the Jira sprint backlog layout (list/table) enriched with PO metadata, so I can manage tickets with context that doesn't exist in Jira.

## Design

### Sprint Slots (top bar)

- 3-4 pinned sprint slots displayed as tabs for quick switching
- Editable via an edit action that opens the full sprint selector
- Sprint selector: search, active/upcoming sprints on top, closed sprints behind an expand/show more
- Selected sprint and slot configuration persisted in DB

### Filter Bar

- Filters: Jira status, epic, assignee, PO status
- Sortable via filter controls (e.g. sort by quality score)
- Default sort order: Jira sprint rank

### Sprint Header

- Sprint name, date range, ticket count, story points distribution (todo / in progress / done)

### Ticket Table

| Column | Source | Notes |
|--------|--------|-------|
| Checkbox | UI | Appears on hover, enables bulk actions |
| Type icon | Jira | Issue type (story, bug, task, etc.) |
| Key | Jira | e.g. VPL-43237 |
| Title | Jira | |
| Epic | Jira | Displayed as label/badge (e.g. BT: UPSELL) |
| Jira Status | Jira | TO DO, IN PROGRESS, etc. |
| Story Points | Jira | |
| Assignee | Jira | Avatar |
| PO Status | Local | Inline dropdown |
| Quality Score | Local | 0-100, number with color indicator (red < 30, orange < 70, green >= 70) |
| Notes | Local | Icon indicator, full content in side panel |

### PO Status Values

- (empty/null) - not yet triaged
- Nieuw - just came in, not yet reviewed
- Uitwerken - PO is writing spec/criteria
- Wachten op feedback - waiting for input from stakeholder/team
- Klaar voor refinement - spec done, needs team refinement
- Ready - refined, estimated, ready for development
- Geparkeerd - deliberately on hold

### Bulk Actions

- Checkboxes appear on row hover, select-all in header
- When rows are selected, a bulk action bar appears with:
  - PO Status change (dropdown)
  - Refresh selected tickets from Jira
  - Trigger review-story for selected tickets

### Side Panel (click on row)

- Full Jira fields
- PO metadata editing (status, quality score, notes)
- Link to Jira (external)
- Start chat about ticket (future)

### Story History & Review Score Actuality

- On each Jira refresh: detect if story content (description/AC) has changed since last stored version
- If changed: store as new version in history
- Quality score is tied to a specific story version
- If story has changed since last review: show score as "stale" with a subtle visual indicator (e.g. faded, small icon)
- History diff view: to be designed separately (future ticket)

### Refresh

- Manual via button, fetches all ticket data from Jira for the selected sprint
- No auto-refresh on page load

## Implementation Phases

### Phase 1: Mock UI
- [x] Sidebar collapse: manual toggle, sprint board uses full available width
- [x] Sprint slots with dummy sprint data (3-4 tabs, switching works)
- [x] Filter bar (UI only, no backend filtering)
- [x] Sprint header with dummy stats
- [x] Ticket table with dummy data (all columns)
- [x] PO Status inline dropdown (local state only) - now icon+color, dropdown shows full names
- [x] Quality score display with color coding
- [x] Notes icon indicator
- [x] Row hover checkbox
- [x] Bulk action bar (UI only)
- [x] Side panel on row click (with dummy data)
- [x] Column visibility toggle (show/hide columns via Columns dropdown)
- [x] Flagged ticket indicator (red left border + flag icon, from Jira)
- [x] PO Status as icon+color in table, full text in dropdown
- [x] Sprint selector dropdown with search, active/future on top, closed behind expand

### Phase 2: Data & API
- [x] DB tables: sprint slots, ticket cache, story versions
- [x] API endpoints for tickets CRUD and PO metadata
- [x] Sprint slot persistence (selected sprint, slot config)
- [x] PO Status, quality score, notes persistence

### Phase 3: Jira Integration
- [x] Jira REST client for fetching sprints and tickets (mock mode, ready for real credentials)
- [x] Sprint list endpoint (active/upcoming/closed) - POST /api/jira/sync-sprints
- [x] Ticket refresh (full data fetch for selected sprint) - POST /api/jira/sync-tickets
- [x] Story version detection and history storage
- [x] Stale quality score detection
- [x] Refresh button wired to sync endpoints with loading state

### Phase 4: Polish
- [x] Filter bar: multi-select dropdowns for Status, Epic, Assignee, PO Status
- [x] Sort: by Jira rank (default), quality score, story points, ticket key
- [x] Persist view preferences in localStorage (columns, sort, filters)
- [x] Bulk actions wired to backend
- [x] Review-story trigger from board
- [x] Story history diff view (implemented via BRDG-004)
- [x] Chat integration from side panel

## Technical Notes

- Sprint slots and PO metadata stored in SQLite via Drizzle ORM
- Jira data is cached locally; source of truth is Jira
- PO metadata is local-only; never pushed back to Jira
- Existing DB schema already has `ticket` and `ticket_metadata` tables

## Dependencies

- Jira REST API access (Phase 3)
- Agent/workspace integration for review-story action (Phase 4)
