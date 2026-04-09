# VC-007: Sprint Board UX Improvements

**Status:** Complete
**Priority:** Medium
**Parent:** VC-002 (Sprint Board)

## Description

As a PO, I want improved navigation and interaction patterns on the sprint board so I can work faster and access Jira context without leaving my flow.

## Acceptance Criteria

### Cmd+click opens Jira in new tab
- [x] Cmd+click (Mac) / Ctrl+click (Windows) on a ticket row opens the Jira ticket URL in a new browser tab
- [x] Regular click still opens the side panel as before

### Side panel: Jira link on ticket key
- [x] The ticket key (e.g. VPL-43237) in the side panel is a clickable link to the Jira ticket
- [x] Opens in a new tab (`target="_blank"`)

### Side panel: show ticket description
- [x] Display the Jira ticket description in the side panel content area
- [x] Render markdown/rich text if present in the Jira description

### Single ticket view: refresh from Jira
- [x] Add a refresh/download button on the ticket detail view
- [x] Clicking it re-syncs that single ticket from Jira (not the entire sprint)
- [x] Show loading state during sync

### Single ticket view: PO notes in sidebar only
- [x] PO notes are displayed exclusively in the sidebar of the ticket detail view
- [x] PO notes are not shown in the main content area

### Collapsed sidebar: notes indicator
- [x] When the sidebar is collapsed, show a visible indicator if the ticket has PO notes (e.g. a badge or dot)
- [x] The indicator must be noticeable enough that notes are not missed

## Technical Notes

- Jira ticket URL format: derive from the ticket key and the configured Jira base URL
- Ticket description is already available in the cached Jira data (fetched during sync)
- Single-ticket refresh: reuse existing Jira sync logic scoped to one ticket key

## Discovered Issues

- Pre-existing build failure: `HistorySection` in `tickets/[key]/page.tsx` had `setLoading(true)` called synchronously inside a `useEffect`, triggering the `react-hooks/set-state-in-effect` lint error. Fixed by removing the redundant call since `loading` was already initialized to `true`.

## Dependencies

- VC-002 Sprint Board (Phase 1-3 complete)
