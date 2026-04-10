# BRDG-061: API Rate Limiting

**Status:** Done
**Priority:** High

## Description

As the app owner, I want rate limiting on API endpoints so a misconfigured client or runaway script cannot overwhelm the backend or exhaust external API quotas (Jira, Bitbucket).

## Acceptance Criteria

### Phase 1: Rate limiter implementation
- [x] In-memory rate limiter module in `src/lib/rate-limiter.ts`
- [x] Sliding window algorithm
- [x] Configurable per-endpoint limits (4 tiers: sync, story-writer, workspace, read)
- [x] Returns 429 Too Many Requests with `Retry-After` header when limit exceeded

### Phase 2: Apply to API routes
- [x] Sync endpoints (`/api/jira/sync-*`): max 5 requests per minute
- [x] Story writer endpoints: max 10 requests per minute
- [x] General read endpoints: max 120 requests per minute (tier available)
- [x] Workspace task creation: max 10 requests per minute

### Phase 3: External API protection
- [x] Jira API call counter: track calls per minute, warn at 80% of known rate limit
- [x] Bitbucket API call counter: track calls per hour
- [ ] Queue and throttle outbound API calls when approaching limits (logging warning only for now)
- [ ] Log rate limit events in activity log (console.warn for now)

## Technical Notes

- Single-user app: global counters per tier, no per-IP tracking
- In-memory Map with timestamps for sliding window
- State resets on server restart (acceptable for single-user)
- External API limits: Jira Cloud ~100 req/min, Bitbucket Cloud ~1000 req/hour
- `applyRateLimit(tier)` function called at top of route handlers

## Out of Scope (for now)
- Distributed rate limiting (Redis-based)
- Per-API-key rate limits
- Rate limit dashboard
- Dynamic rate limit adjustment
