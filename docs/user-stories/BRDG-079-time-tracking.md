# BRDG-079: Time Tracking Integration (Tempo/Clockify)

**Status:** Open
**Priority:** Low

## Description

As the PO, I want to see logged hours per ticket from Tempo or Clockify alongside story points on the Sprint Board so I can track actual effort and improve estimation accuracy.

## Acceptance Criteria

### Phase 1: Time tracking connection
- [ ] Settings: select provider (Tempo or Clockify) and enter API credentials
- [ ] Health check endpoint: `GET /api/time-tracking/health`
- [ ] Connection test on settings page

### Phase 2: Per-ticket time data
- [ ] Fetch logged hours for each ticket in the sprint
- [ ] API route: `GET /api/tickets/[key]/time-logged`
- [ ] Response: total hours, breakdown by person, breakdown by date
- [ ] Cache time data (refresh on sync, TTL 5 minutes)

### Phase 3: Sprint Board integration
- [ ] New column on Sprint Board: "Time Logged" showing total hours per ticket
- [ ] Optional column: "Estimate vs Actual" showing ratio (story points vs hours)
- [ ] Color coding: green (on track), amber (50%+ over estimate), red (100%+ over)
- [ ] Sprint total: sum of logged hours for all sprint tickets

### Phase 4: Sprint analytics
- [ ] Effort distribution chart: planned (points) vs actual (hours) per ticket
- [ ] Team utilization: logged hours per person this sprint
- [ ] Historical estimation accuracy: trend over last 5 sprints

## Technical Notes

- Tempo API: `GET /core/3/worklogs?issue=VALK-42` (requires Tempo OAuth or API token)
- Clockify API: `GET /workspaces/{id}/time-entries?project={id}` (API key auth)
- Map Jira ticket keys to time tracking entries via issue key or project mapping
- Time data is supplementary; Sprint Board should work fine without it (graceful degradation)
- Consider a provider abstraction layer for easy addition of other tools

## Out of Scope (for now)
- Logging time from Bridge
- Time estimates in Bridge (use story points)
- Billing or invoicing features
- Overtime tracking
