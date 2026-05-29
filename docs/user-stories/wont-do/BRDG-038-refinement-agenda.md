# BRDG-038: Refinement Agenda

**Status:** Open
**Priority:** High

## Description

As the PO, I want a Refinement view that auto-sorts backlog stories by readiness, highlights gaps, and offers a fullscreen refinement mode so I can run structured refinement sessions efficiently.

## Acceptance Criteria

### Phase 1: Refinement list
- [ ] New page at `/refinement` replacing the current placeholder
- [ ] Fetch all tickets from the next upcoming sprint (or selected sprint)
- [ ] Sort by refinement readiness: stories without AC first, then low quality score, then unreviewed
- [ ] Each row shows: ticket key, title, readiness indicators (AC present, quality score, has estimate, has assignee)
- [ ] Color-coded readiness bar per ticket (red/amber/green based on completeness)

### Phase 2: Readiness checklist
- [ ] Expandable checklist per ticket showing: has description, has AC, has story points, has assignee, quality score above threshold, no stale warning
- [ ] Overall sprint readiness percentage at the top
- [ ] Filter: show only tickets failing readiness check

### Phase 3: Fullscreen refinement mode
- [ ] "Start Refinement" button that enters a fullscreen overlay
- [ ] Shows one ticket at a time with full story content, AC, and dev panel
- [ ] Navigation: Previous / Next / Skip buttons
- [ ] Optional timer per ticket (configurable, default 5 minutes, visible countdown)
- [ ] Mark as "Refined" / "Needs Work" / "Skip" action buttons
- [ ] Progress bar showing position in the queue (e.g. "3 of 12")

### Phase 5: In-refinement editing (also applies to ticket single view)
- [ ] Quick subtask creation: input that only requires a title, creates the subtask on submit (available in refinement mode and ticket single view)
- [ ] PO notes panel: view existing PO notes and add new ones inline
- [ ] Quick content edits: inline editing of description/AC fields without leaving the view
- [ ] Comments panel: read all Jira comments on the ticket
- [ ] Story points input: set or update the estimate directly from refinement mode / single view
- [ ] Issue type selector: change the issue type (Story, Task, Bug, Sub-task, etc.) without opening Jira

### Phase 4: Refinement summary
- [ ] After completing refinement mode, show a summary: refined count, needs-work count, skipped count
- [ ] List of tickets marked "Needs Work" with links
- [ ] Option to export summary as markdown

## Technical Notes

- Readiness scoring logic: assign points per criterion (AC=30, description=20, points=15, assignee=10, quality=25), sum for percentage
- Fullscreen mode uses a portal or dedicated layout to hide sidebar/header
- Timer uses `requestAnimationFrame` or `setInterval` with cleanup
- "Refined" status maps to PO metadata field, not Jira status

## Out of Scope (for now)
- Multi-user refinement (voting, team participation)
- Video call integration
- Jira transition triggers from refinement actions
- Historical refinement session tracking
