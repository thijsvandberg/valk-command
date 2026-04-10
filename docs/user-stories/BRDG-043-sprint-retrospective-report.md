# BRDG-043: Sprint Retrospective Report

**Status:** Open
**Priority:** Low

## Description

As the PO, I want to generate a sprint retrospective report with velocity analysis, carry-over tracking, and quality trends so I have data-driven input for retrospective meetings.

## Acceptance Criteria

### Phase 1: Report generation
- [ ] "Generate Report" button on Sprint Board (available for completed sprints)
- [ ] API route `GET /api/reports/sprint-retro?sprint=SPRINT_ID` that aggregates sprint data
- [ ] Report includes: sprint name, dates, team members

### Phase 2: Report content
- [ ] **Velocity section**: committed points vs completed points, comparison with previous sprint
- [ ] **Completion breakdown**: done / carry-over / removed tickets with lists
- [ ] **Quality scores**: average quality score of completed stories, trend vs previous sprint
- [ ] **Story Writer usage**: sessions created, drafts applied, time saved estimate
- [ ] **Sync health**: total syncs, failure rate, average sync duration

### Phase 3: Display and export
- [ ] Dedicated report page with clean, printable layout
- [ ] Export as Markdown (copy to clipboard)
- [ ] Export as PDF (browser print with print stylesheet)
- [ ] Store generated reports in DB for historical access

## Technical Notes

- Velocity data computed from ticket story points + status at sprint close
- Carry-over detection: tickets that were in sprint at start but not completed
- Quality trend requires storing historical quality scores (snapshot on sprint close)
- Consider adding a sprint-close snapshot job to the scheduler

## Out of Scope (for now)
- Automated retro facilitation
- Team satisfaction surveys
- Burndown/burnup charts
- Integration with retro tools (EasyRetro, Metro Retro)
