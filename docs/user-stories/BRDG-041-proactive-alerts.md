# BRDG-041: Proactive Alerts System

**Status:** Open
**Priority:** High

## Description

As the PO, I want configurable proactive alerts that surface issues automatically (stale stories, missing AC, failed syncs, merged PRs without review) so problems are flagged before I discover them manually.

## Acceptance Criteria

### Phase 1: Alert engine
- [ ] Alert evaluation logic that runs on a schedule (piggyback on existing scheduler tick, or on each sync completion)
- [ ] Alert rules defined in code (extensible, each rule is a function returning alerts)
- [ ] Alert entity stored in existing `alert` table with: type, severity (info/warning/critical), message, ticketKey (optional), dismissedAt
- [ ] API route `GET /api/alerts` (list active alerts, filterable by severity)
- [ ] API route `POST /api/alerts/[id]/dismiss` to dismiss an alert

### Phase 2: Built-in alert rules
- [ ] **Stale quality score**: ticket content changed since last review (reuse stale detection logic)
- [ ] **Missing acceptance criteria**: ticket in sprint without AC field populated
- [ ] **Sync failure**: Jira sync failed 3+ consecutive times
- [ ] **Unestimated in sprint**: ticket in active sprint without story points
- [ ] **PR merged without review**: Bitbucket PR merged with 0 approvals (if data available)

### Phase 3: In-app notification center
- [ ] Bell icon in the app header showing unread alert count badge
- [ ] Dropdown panel listing recent alerts with severity icons
- [ ] Click alert to navigate to relevant ticket or page
- [ ] "Dismiss" and "Dismiss all" actions
- [ ] Empty state when no active alerts

### Phase 4: Browser push notifications
- [ ] Opt-in browser notification permission request
- [ ] Push notification for critical alerts (sync failure, build failure)
- [ ] Notification click opens the app at the relevant page
- [ ] Respect system Do Not Disturb / notification settings

## Technical Notes

- Alert rules are pure functions: `(tickets, metadata, syncStatus) => Alert[]`
- Run alert evaluation after each sync cycle completes (not on a separate timer)
- Deduplicate alerts: same type + same ticketKey = update existing, don't create duplicate
- Browser notifications via the Notification API (already have service worker from BRDG-028)

## Out of Scope (for now)
- Email notifications
- Slack notifications (separate story BRDG-074)
- Custom alert rules (user-defined)
- Alert history / audit log
- Scheduled alert digests
