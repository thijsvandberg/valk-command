# BRDG-122: Integration Health Dashboard

**Status:** Open
**Priority:** Low

## Description

The app integrates with Jira, Bitbucket, Confluence, and the workspace agent. The current integrations settings page (`src/app/(app)/settings/integrations/page.tsx`) only shows basic connection status (ok/error/unconfigured). When something goes wrong, there is no visibility into sync history, API quota usage, or error patterns.

### Proposed features

- **Connection status** per integration (already exists, extend it)
- **Last successful sync timestamp** per integration
- **Error count in last 24 hours** with expandable error log
- **API quota usage** (Jira rate limit: 100/min, Bitbucket: 1000/hr, both tracked in `src/lib/rate-limiter.ts`)
- **Sync history timeline** (last 10 syncs per integration with status and duration)
- **Quick actions:** force re-sync, test connection, clear cache

### Data sources

- `activityLog` table (already tracks all sync operations with status and duration)
- Rate limiter outbound tracking (`src/lib/rate-limiter.ts` already tracks call counts)
- Health endpoints: `/api/jira/health`, `/api/confluence/health`, `/api/pipelines/health`, `/api/workspace-tasks/health`

### Location

Extend existing settings/integrations page or add a dedicated sub-page.

## Acceptance Criteria

- [ ] Show real-time API quota usage per integration
- [ ] Show error count and expandable recent error log
- [ ] Show sync history timeline (last 10 syncs per type)
- [ ] Show last successful sync timestamp
- [ ] Force re-sync button per integration
- [ ] Clear cache button
- [ ] Auto-refresh status while page is open

## Impact

Provides full observability into integration health, replacing the current minimal ok/error/unconfigured indicators with actionable data. When a sync fails or an API quota is exhausted, the PO can diagnose the issue immediately instead of guessing or checking logs manually.
