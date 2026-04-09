# BRDG-021: Jira Sync Resilience

**Status:** Done
**Priority:** High
**Estimate:** Medium
**Depends on:** BRDG-019, BRDG-020

## Description

The Jira sync pipeline has no rate limiting, no retry logic for transient failures, makes excessive API calls per issue (separate attachment fetch per ticket), and has edge cases around sync cancellation race conditions and stale sprint cache entries.

## Context

The Jira integration syncs sprints, tickets, and comments via `src/lib/jira-client.ts` and three sync routes under `src/app/api/jira/`. Jira Cloud rate limits at ~300 requests/minute for API token auth. Currently there is no throttling, no backoff on 429 responses, and no retry on transient errors (503, network timeouts). A full sprint sync of 100 tickets triggers 100+ individual API calls (one per ticket for attachments) without any delay.

## Acceptance Criteria

### Phase 1: Rate limiting and retry logic
- [x] Add a request throttle to `jiraFetch` and `jiraPost` in `src/lib/jira-client.ts`. Options:
  - Simple: add a configurable delay between requests (e.g., 100ms)
  - Better: use a token bucket or sliding window (max 200 req/min with buffer)
- [x] Add retry logic with exponential backoff for:
  - HTTP 429 (rate limited) - respect `Retry-After` header if present
  - HTTP 503 (service unavailable)
  - Network errors / timeouts
- [x] Max 3 retries per request, then throw
- [x] Pass the AbortSignal through retry logic so cancellation still works

### Phase 2: Reduce API calls during ticket sync
- [x] `src/app/api/jira/sync-tickets/route.ts:127-142` - Currently calls `getAttachments()` per issue during upsert. Instead:
  - Option A: Batch attachment fetches after all tickets are synced
  - Option B: Skip attachment sync unless explicitly requested (separate sync-attachments endpoint)
  - Option C: Include attachment data in the main issue fetch if the Jira API supports it (check `fields=attachment` parameter)
  - **Chosen: Option C** - Added `attachment` to `ISSUE_FIELDS` so it is included in the main search response. No extra API call needed.
- [x] Document the chosen approach in code comments

### Phase 3: Fix sync cancellation race condition
- [x] `src/app/api/sync-log/[id]/cancel/route.ts:35` - Currently marks sync as "cancelled" in DB immediately, but the actual sync may have already completed between the check and the update
- [x] Fix: use an optimistic concurrency check. Only update status if it's still "running":
  ```sql
  UPDATE sync_log SET status = 'cancelled' WHERE id = ? AND status = 'running'
  ```
- [x] Check the update's `changes` count to determine if the cancel was effective

### Phase 4: Stale sprint cache cleanup
- [x] `src/app/api/jira/sync-sprints/route.ts:54-66` - When merging sprint data, a sprint that moved from "active" to "closed" keeps its old entry in the active cache
- [x] Fix: when syncing active/future sprints, check if any existing cached sprints have changed state and update them
  - **Approach:** Remove cached entries that match synced states OR whose ID appears in fresh data. This handles state transitions without duplicates.
- [x] Alternative: always do a full replace for the synced scope instead of merge

### Phase 5: Sync log retention
- [x] Add automatic cleanup in `src/app/api/sync-log/route.ts` GET handler: delete entries older than 7 days (or keep max 200 entries)
- [x] Run cleanup at the start of each GET request (same pattern as the stale-running cleanup already there)

## Key Files

- `src/lib/jira-client.ts` - all Jira API calls (rate limiting goes here)
- `src/app/api/jira/sync-tickets/route.ts` - ticket sync (attachment optimization)
- `src/app/api/jira/sync-sprints/route.ts` - sprint sync (cache staleness)
- `src/app/api/jira/sync-comments/route.ts` - comment sync
- `src/app/api/sync-log/[id]/cancel/route.ts` - cancel race condition
- `src/app/api/sync-log/route.ts` - retention cleanup
- `src/lib/sync-abort.ts` - abort controller registry

## Verification

```bash
npx vitest run                # all tests pass
npm run build                 # clean build
# Manual: trigger a full sprint sync, watch network tab - requests should have ~100ms gaps
# Manual: cancel a running sync - verify status shows "cancelled" in sync log
# Manual: sync sprints, close a sprint in Jira, re-sync - old entry should update
```
