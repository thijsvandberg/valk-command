# BRDG-093: Stakeholder View - Carry-over Detection

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want tickets that were carried over from the previous sprint to be visually marked in the stakeholder view so stakeholders can understand how much work spilled over without me having to explain it manually.

## Acceptance Criteria

- [ ] Tickets present in both the current sprint and the previous sprint (matched by Jira key) are marked with a small "carried" indicator
- [ ] The indicator is subtle (e.g. a small badge or icon) and does not disrupt the ticket card layout
- [ ] A summary count is shown above the ticket columns (e.g. "3 tickets carried from Sprint BM: 134")
- [ ] The summary and indicators are only shown when previous sprint data is available
- [ ] If previous sprint data is not yet loaded, it is fetched on demand; a loading state is shown while fetching
- [ ] If no tickets were carried over, no summary or indicator is shown

## Technical Notes

- Carry-over is determined by Jira key: a ticket in the current sprint whose `jiraKey` also appears in the previous sprint's ticket set
- Previous sprint data may already be in memory from sprint navigation; reuse it if available, otherwise fetch it
- Matching is case-insensitive to guard against key casing inconsistencies
- Only the stakeholder-safe ticket fields should be used; do not expose PO-internal fields in this computation
- Keep carry-over state in the page component or a dedicated hook; do not persist to the database

## Out of Scope

- Detecting tickets carried over more than one sprint back
- Tracking carry-over history over time
- Carry-over detection in the main sprint board view
- Alerting or notifications for carry-over
