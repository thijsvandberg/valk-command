# BRDG-074: Slack Integration

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want Slack notifications for key events and the ability to post sprint summaries to a channel so my team stays informed without checking Bridge directly.

## Acceptance Criteria

### Phase 1: Slack webhook setup
- [ ] Settings page field for Slack incoming webhook URL
- [ ] Test webhook button (sends a test message)
- [ ] Webhook URL stored encrypted in appSetting (reuse BRDG-064 encryption)

### Phase 2: Event notifications
- [ ] Configurable events that trigger Slack messages:
  - [ ] Sync failure (critical)
  - [ ] Story writer draft completed
  - [ ] Build failure on a sprint ticket
  - [ ] Sprint readiness threshold reached (e.g., 80% of stories refined)
- [ ] Each event type can be enabled/disabled individually
- [ ] Messages formatted with Slack Block Kit (structured, readable)

### Phase 3: Sprint summary post
- [ ] "Post to Slack" button on Sprint Board
- [ ] Sends a formatted sprint summary: progress, completed stories, blockers
- [ ] Preview before sending
- [ ] Includes link back to Bridge stakeholder view

### Phase 4: Channel selection
- [ ] Support multiple webhook URLs for different channels
- [ ] Route different event types to different channels (e.g., alerts to #engineering, summaries to #product)

## Technical Notes

- Slack Incoming Webhooks: simple HTTP POST, no OAuth needed
- Block Kit for rich formatting: sections, fields, buttons, dividers
- Fire-and-forget: post to Slack asynchronously, don't block app actions
- Queue failed messages for retry (max 3 attempts)

## Out of Scope (for now)
- Slack bot (interactive messages, slash commands)
- Bidirectional Slack-to-Bridge communication
- Thread replies
- Direct messages
- Slack OAuth app distribution
