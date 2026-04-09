# BRDG-016: Jira Webhook Receiver

**Status:** Backlog (Nice to have)
**Priority:** Low
**Depends on:** BRDG-011 (Real Jira Integration)

## Description

Add a webhook receiver endpoint so Jira can push change notifications to valk-command in real-time, instead of relying solely on polling and manual sync triggers.

## Acceptance Criteria

- [ ] `POST /api/jira/webhook` receives Jira webhook payloads
- [ ] Validates `x-hub-signature` header using HMAC-SHA256 with `JIRA_WEBHOOK_SECRET`
- [ ] Parses event types: `jira:issue_updated`, `jira:issue_created`, `jira:issue_deleted`, `comment_created`, `comment_updated`
- [ ] Deduplicates events: checks syncLog for a recent entry with the same scope (ticket key) within 30 seconds
- [ ] Triggers a targeted single-ticket sync for the affected issue key
- [ ] Returns 200 immediately (processing happens asynchronously)
- [ ] Logs all webhook events to syncLog with type `webhook`
- [ ] Invalid or missing signatures return 401
- [ ] Unknown event types are logged but ignored (return 200)

## Technical Design

### Route

`src/app/api/jira/webhook/route.ts` (POST only)

### Signature Validation

```
HMAC-SHA256(JIRA_WEBHOOK_SECRET, request body)
```

Compare against the `x-hub-signature` header (format: `sha256=<hex>`). Use `crypto.timingSafeEqual` to prevent timing attacks.

### Event Parsing

Jira webhook payloads include:
- `webhookEvent`: event type string (e.g. `jira:issue_updated`)
- `issue.key`: the affected issue key (e.g. `VPL-123`)
- `comment`: present for comment events
- `changelog`: present for issue update events

### Deduplication

Before triggering a sync, query syncLog for entries where:
- `type = 'webhook'`
- `scope = <issue key>`
- `startedAt` is within the last 30 seconds

If a recent entry exists, skip the sync (return 200 with `{ deduplicated: true }`).

### Targeted Sync

Call the existing sync-tickets endpoint internally (or directly use the upsert logic) for just the affected ticket key. This keeps a single data path for consistency.

### Environment Variable

- `JIRA_WEBHOOK_SECRET`: shared secret configured in both Jira webhook settings and valk-command env

### Jira Configuration

In Jira Cloud (Settings > System > WebHooks):
- URL: `https://<valk-command-host>/api/jira/webhook`
- Events: Issue created, Issue updated, Comment created, Comment updated
- Secret: matches `JIRA_WEBHOOK_SECRET`

## Notes

- Webhooks trigger re-sync, not direct data ingestion. This ensures all data flows through the same sync pipeline, maintaining consistency.
- This is a "nice to have" enhancement. The app works fully without webhooks via polling (useSyncStatus) and manual sync triggers.
- Requires the app to be publicly accessible (or use a tunnel like ngrok for development).
