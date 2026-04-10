# BRDG-078: CI/CD Pipeline Feed

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a real-time feed of pipeline runs linked to tickets, showing build status, deploy status, and test results so I have deployment visibility from within Bridge.

## Acceptance Criteria

### Phase 1: Pipeline feed page
- [ ] New page at `/pipelines` or section within Test Center
- [ ] List of recent pipeline runs across all configured repos
- [ ] Each run shows: branch name, linked ticket (if detected), status, duration, timestamp
- [ ] Auto-refresh every 60 seconds

### Phase 2: Ticket linkage
- [ ] Parse branch names for ticket keys (e.g., "feature/VALK-42-description" links to VALK-42)
- [ ] Show pipeline status on ticket detail page (reuse dev panel)
- [ ] Filter pipeline feed by sprint (show only runs for sprint tickets)

### Phase 3: Status aggregation
- [ ] Pipeline health metrics: runs today, pass rate, average duration
- [ ] "Currently running" section at the top
- [ ] Failed runs highlighted with error summary (if available from API)
- [ ] Link to pipeline run in Bitbucket/GitHub for full details

### Phase 4: Deploy tracking
- [ ] Track deployment pipelines specifically (based on pipeline name pattern or tag)
- [ ] Show deployment timeline: which tickets were deployed when
- [ ] "Last deployed" indicator on Sprint Board tickets

## Technical Notes

- Bitbucket Pipelines API: `GET /repositories/{workspace}/{repo}/pipelines/`
- GitHub Actions API: `GET /repos/{owner}/{repo}/actions/runs`
- Poll every 60 seconds (or configurable interval)
- Store pipeline runs in a local cache table for quick access and historical tracking
- Branch-to-ticket mapping: regex `/(VALK-\d+)/` on branch name

## Out of Scope (for now)
- Triggering pipelines from Bridge
- Pipeline configuration editing
- Deployment approvals
- Pipeline logs viewing (link out to provider)
