# BRDG-144: Epic Picker in Sidebar

**Status:** Draft
**Priority:** Medium
**Depends on:** BRDG-137

## Description

As a Product Owner, I want to change or link an epic to a ticket directly from the sidebar, so I can organize tickets under epics without switching to Jira.

## Acceptance Criteria

- [ ] Searchable epic picker dropdown in the sidebar Epic row
- [ ] Search epics via existing Jira search (filter by issuetype=Epic)
- [ ] Set epic: calls `jiraClient.updateIssue(key, { parent: { key: epicKey } })` and updates local DB
- [ ] Remove epic: set parent to null
- [ ] Optimistic UI update with rollback on failure

## Technical Notes

- `updateIssue` already supports setting `parent` field via Jira REST API v3
- Epic row already displays in sidebar (BRDG-137), just needs the picker interaction
- Reuse search pattern from SprintPicker/AssigneePicker components
- Update PATCH `/api/tickets/[key]` to support `epicKey` field
