# BRDG-077: Google Calendar Integration

**Status:** Open
**Priority:** Low

## Description

As the PO, I want to see upcoming ceremonies (refinement, sprint review, retro) from Google Calendar on the Dashboard so I know when to prepare.

## Acceptance Criteria

### Phase 1: Calendar connection
- [ ] OAuth2 flow for Google Calendar API (or API key for read-only)
- [ ] Settings page to connect/disconnect Google account
- [ ] Select which calendar(s) to show events from

### Phase 2: Upcoming events widget
- [ ] Dashboard widget showing next 5 events from connected calendar
- [ ] Each event: title, date/time, duration, calendar color
- [ ] "Today" and "This week" grouping
- [ ] Link to open event in Google Calendar

### Phase 3: Ceremony detection
- [ ] Auto-tag events matching keywords: "refinement", "review", "retro", "standup", "planning"
- [ ] Show ceremony-specific icon and color
- [ ] "Prepare" quick action link: refinement links to Refinement page, review links to sprint report

## Technical Notes

- Google Calendar API v3: `GET /calendars/{id}/events`
- OAuth2 for user authentication (requires Google Cloud project + consent screen)
- Alternative: iCal feed URL (read-only, no OAuth needed, simpler setup)
- Consider iCal approach first for simplicity; upgrade to OAuth if interactivity is needed
- Cache events with 15-minute TTL

## Out of Scope (for now)
- Creating calendar events from Bridge
- Meeting notes integration
- Time zone handling (assume single timezone)
- Microsoft Outlook / Office 365 calendar
