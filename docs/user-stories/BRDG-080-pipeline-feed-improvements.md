# BRDG-080: Pipeline Feed Improvements

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the pipeline feed to be more deeply integrated with ticket development info, and provide better filtering and visibility so I can quickly understand deployment status per ticket and sprint.

## Acceptance Criteria

### Phase 0: Performance - page load is too slow
- [x] Pipeline page blocks on inline Bitbucket sync on first load (fetches 75+ pipelines + commit lookups sequentially)
- [x] Serve persisted data immediately from DB, run sync in background (non-blocking)
- [x] Commit message lookups for ticket keys should be batched/parallelized, not sequential per pipeline
- [x] Add loading skeleton while background sync runs so page is instantly interactive
- [x] Target: page renders in under 500ms from persisted data, sync updates trickle in afterward

### Phase 1: Unify pipeline data with dev-info
- [x] Pipeline feed page shows the same PR/branch/deployment data that the ticket Development tab shows
- [x] Pipeline runs link to their associated PR (when a pipeline is triggered by a PR merge)
- [x] Show PR title and author alongside the pipeline run (not just the commit message ticket key)
- [x] Pipeline History section on ticket Development tab shows deployment environment badges (like the existing Deployments table)
- [x] Deduplicate between dev-info Deployments table and Pipeline History section on ticket detail

### Phase 2: Enriched pipeline rows
- [x] Show commit message summary (first line) on pipeline rows for context
- [x] Multiple ticket keys per pipeline (some merge commits reference multiple tickets)
- [x] Pipeline run shows source branch name for merge-triggered pipelines (e.g., "feature/VPL-43447-..." merged into master)
- [x] Link to the PR that triggered the pipeline (when available via Bitbucket API)

### Phase 3: Sprint-aware pipeline view
- [ ] Default sprint filter to the active sprint
- [ ] Sprint pipeline summary: how many runs, pass rate, deployments per sprint
- [ ] Group pipeline runs by ticket within a sprint view
- [ ] Show ticket title alongside ticket key in pipeline rows

### Phase 4: Pipeline feed UX improvements
- [ ] Pagination or virtual scrolling for large pipeline lists (currently limited to 100)
- [ ] Date range filter (today, this week, this sprint, custom)
- [ ] Status filter (show only failed, only deployments, etc.)
- [ ] Search/filter by creator name
- [ ] Collapsible deployment timeline section
- [ ] Keyboard shortcuts for navigation and filtering

### Phase 5: Pipeline-to-ticket sync
- [ ] When a pipeline completes for a followed ticket, update the ticket's test status in PO metadata
- [ ] Show aggregate pipeline health per ticket on Sprint Board (green/red/yellow indicator)
- [ ] Pipeline failure count badge on ticket rows

## Technical Notes

- Dev-info route already fetches PR data, builds, and deployments per ticket via Bitbucket API
- Pipeline feed uses persisted pipeline_runs table which is populated by the independent pipeline-sync lazy-cron
- The two data sources (dev-info real-time API and pipeline_runs persistent table) need a unification strategy
- Consider caching dev-info PR data in the pipeline_runs table to avoid duplicate API calls
- Multiple ticket keys: change ticket_key column to a JSON array or comma-separated string
- Source branch for merge pipelines: available from the commit message or by looking up the merge commit's parent PR

## Out of Scope
- Triggering pipelines from Bridge
- Pipeline logs viewing (link out to Bitbucket)
- Pipeline configuration editing
- SonarQube integration (visible in Bitbucket but not yet surfaced in Bridge)
