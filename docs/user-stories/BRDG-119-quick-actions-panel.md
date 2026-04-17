# BRDG-119: Quick Actions Panel ("PO Toolbar")

**Status:** Open
**Priority:** Medium

## Description

Common PO actions (start story writer, quick-review, add notes, change readiness, open in Jira) all require navigating to the ticket detail view first. When working through a sprint board reviewing multiple tickets, this context-switching is slow.

### Proposed features

- Floating action panel or context menu triggered from the sprint board
- Available when a ticket row is selected or right-clicked
- Actions:
  - Open Story Writer for this ticket
  - Quick-review story quality (triggers /review-story)
  - Add/edit PO notes (inline editor)
  - Change PO status / readiness
  - Open ticket in Jira (external link)
  - Open ticket detail (internal navigation)
  - Copy ticket key

This would work alongside the existing sprint board side panel, not replace it.

### Related

BRDG-051 (Inline Ticket Editing, open) shares the goal of reducing context switches.

## Acceptance Criteria

- [ ] Context menu or floating panel appears on right-click or keyboard shortcut on ticket row
- [ ] All listed actions work from the panel without navigating away
- [ ] PO notes can be edited inline
- [ ] PO status can be changed via dropdown
- [ ] Story Writer launches for selected ticket
- [ ] Actions are keyboard-accessible
- [ ] Panel dismisses on Escape or click outside

## Impact

Removes the need to open each ticket individually when performing bulk PO workflows on the sprint board. Reviewing, annotating, and adjusting readiness for a full sprint of tickets becomes significantly faster.
