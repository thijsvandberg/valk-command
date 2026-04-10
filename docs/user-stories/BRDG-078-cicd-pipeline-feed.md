# BRDG-078: CI/CD Pipeline Feed

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want a feed of pipeline runs linked to tickets, showing build status, deploy status, and test results so I have deployment visibility from within Bridge. I can follow specific tickets to get updates, and receive browser notifications when deployments complete.

## Acceptance Criteria

### Phase 1: Pipeline feed page
- [x] New page at `/pipelines` with its own sidebar entry
- [x] List of recent pipeline runs across all configured repos
- [x] Each run shows: repo name, branch name, linked ticket (if detected), status, duration, timestamp
- [x] Repo filter/column to distinguish runs from different repositories
- [x] Adaptive polling: 5 min default, speeds up to 30s when pipelines are actively running
- [x] Polling slows back to 5 min when no running pipelines are detected

### Phase 2: Ticket linkage
- [x] Parse branch names for ticket keys (e.g., "feature/VALK-42-description" links to VALK-42)
- [x] Show pipeline status on ticket detail page (reuse dev panel)
- [x] Filter pipeline feed by sprint (show only runs for sprint tickets)
- [x] Sprint feed is passive only: visible in the feed, no automatic notifications

### Phase 3: Follow tickets
- [x] Follow/unfollow toggle (star/watch icon) on ticket rows and ticket detail page
- [x] Followed tickets stored in local DB (per-user preference)
- [x] Notification feed (bell icon in top bar) showing updates for followed tickets
- [x] Notification types: pipeline completed, pipeline failed, PR merged, deployment done
- [x] Unread count badge on bell icon
- [x] Mark as read (individual and mark-all)
- [x] Extend existing `alert` table with additional fields for notification metadata (source ticket, notification category, link URL)

### Phase 4: Status aggregation
- [ ] Pipeline health metrics: runs today, pass rate, average duration
- [ ] "Currently running" section at the top
- [ ] Failed runs highlighted with error summary (if available from API)
- [ ] Link to pipeline run in Bitbucket for full details

### Phase 5: Deploy tracking with browser notifications
- [ ] Track deployment pipelines using existing environment detection (regex on pipeline step names: Production, Staging, UAT, Test)
- [ ] Show deployment timeline: which tickets were deployed when
- [ ] "Last deployed" indicator on Sprint Board tickets (requires persistent pipeline data)
- [ ] Browser push notifications (Web Notifications API) when a deployment completes
- [ ] One-time permission prompt for browser notifications
- [ ] Notification shows: environment (staging/production), ticket keys included, success/failure
- [ ] Setting to enable/disable deploy notifications per environment

## Technical Notes

- Bitbucket Pipelines API only (GitHub Actions is out of scope)
- Bitbucket API: `GET /repositories/{workspace}/{repo}/pipelines/`
- Multi-repo: fetch pipelines for all repos in `BITBUCKET_REPO_SLUG` (comma-separated), display repo name per run
- Adaptive polling: 5 min idle, 30s when pipelines are running
- New `pipeline_runs` table to persist pipeline data locally (needed for historical tracking, "last deployed" indicator, and state change detection for notifications)
- Branch-to-ticket mapping: regex `/(VALK-\d+)/` on branch name
- Followed tickets: new `followed_tickets` table in schema
- Notifications: extend existing `alert` table (already has id, type, jiraKey, message, createdAt, read) with fields for notification source and link URL. Use for in-app feed. Web Notifications API for deploy push notifications only.
- Deploy detection: reuse existing environment detection regex from dev-info route (Production, Staging, UAT1-3, Test)
- Browser notification permission: request on first deploy notification toggle, respect denial gracefully

## Existing Code to Leverage

- `src/app/api/tickets/[key]/dev-info/route.ts`: Bitbucket API integration, auth, state normalization, environment detection
- `src/hooks/useNotification.ts`: Browser notification permission and dispatch
- `src/components/ticket-detail/TicketDevelopment.tsx`: DeploymentsTable component
- `src/db/schema.ts`: `alert` table for notification foundation

## Out of Scope (for now)
- GitHub Actions support
- Triggering pipelines from Bridge
- Pipeline configuration editing
- Deployment approvals
- Pipeline logs viewing (link out to provider)
- Push notifications for non-deployment events (in-app feed only)
