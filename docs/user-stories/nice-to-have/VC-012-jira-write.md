# VC-012: Jira Write-Back

**Status:** Not Started
**Priority:** Medium

## Description

Push local changes from valk-command back to Jira. Builds on the local editing and conflict resolution layer from VC-011.

## Acceptance Criteria

- [ ] Push local draft to Jira on explicit user action
- [ ] Transition ticket status from sprint board
- [ ] Add comments to Jira from ticket detail view
- [ ] Push PO metadata back as Jira custom field or comment
- [ ] Confirmation dialog before pushing changes
- [ ] Success/failure feedback after push

## Dependencies

- VC-011 (local editing & conflict resolution must be in place)
- Jira API write scopes
