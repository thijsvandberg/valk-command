# BRDG-039: Test Center

**Status:** Open
**Priority:** High

## Description

As the PO, I want a Test Center that aggregates test and pipeline results per ticket, tracks manual test status, and shows overall release readiness so I have a single place to assess quality before release.

## Acceptance Criteria

### Phase 1: Test Center page
- [ ] New page at `/test-center` replacing the current placeholder
- [ ] Sprint selector (reuse sprint slot component)
- [ ] Table view of all tickets in selected sprint with test-related columns

### Phase 2: Pipeline integration
- [ ] Pull Bitbucket Pipeline results for branches linked to each ticket (reuse dev-info API)
- [ ] Show per-ticket: last build status (pass/fail/running), build date, link to pipeline
- [ ] Aggregate stats at top: total builds, pass rate, last failure

### Phase 3: Manual test tracking
- [ ] PO metadata field `testStatus`: untested / passed / failed / blocked
- [ ] Editable inline on the Test Center table
- [ ] Filter by test status
- [ ] Bulk action: mark multiple tickets as tested

### Phase 4: Release readiness score
- [ ] Calculate readiness: percentage of tickets with passing pipeline + manual test passed
- [ ] Visual indicator (progress ring or bar) at the top of the page
- [ ] List of blockers: tickets with failed builds or failed/blocked test status
- [ ] "Release blockers" filter preset

## Technical Notes

- Reuse existing Bitbucket pipeline data from BRDG-030 dev-info API
- Manual test status stored in `ticket_metadata` table (extend schema if needed)
- Test Center is read-heavy; use SWR with moderate refresh interval (60s)
- Build data may be stale; show "last fetched" timestamp

## Out of Scope (for now)
- Automated test execution from Bridge
- Test case management (detailed test scripts)
- Integration with dedicated test tools (TestRail, Zephyr)
- Test coverage metrics
