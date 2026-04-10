# BRDG-061: API Rate Limiting

**Status:** Open
**Priority:** High

## Description

As the app owner, I want rate limiting on API endpoints so a misconfigured client or runaway script cannot overwhelm the backend or exhaust external API quotas (Jira, Bitbucket).

## Acceptance Criteria

### Phase 1: Rate limiter implementation
- [ ] In-memory rate limiter module in `src/lib/rate-limiter.ts`
- [ ] Token bucket or sliding window algorithm
- [ ] Configurable per-endpoint limits
- [ ] Returns 429 Too Many Requests with `Retry-After` header when limit exceeded

### Phase 2: Apply to API routes
- [ ] Sync endpoints (`/api/jira/sync-*`): max 5 requests per minute
- [ ] Story writer endpoints: max 10 requests per minute
- [ ] General read endpoints: max 120 requests per minute
- [ ] Workspace task creation: max 10 requests per minute

### Phase 3: External API protection
- [ ] Jira API call counter: track calls per minute, warn at 80% of known rate limit
- [ ] Bitbucket API call counter: same tracking pattern
- [ ] Queue and throttle outbound API calls when approaching limits
- [ ] Log rate limit events in activity log

## Technical Notes

- Single-user app, so per-IP tracking is not necessary; global counters suffice
- Use a simple Map with timestamps for sliding window
- Rate limit state resets on server restart (acceptable for single-user)
- External API limits: Jira Cloud ~100 req/min, Bitbucket Cloud ~1000 req/hour
- Middleware approach: wrap rate limiter as a higher-order function for route handlers

## Out of Scope (for now)
- Distributed rate limiting (Redis-based)
- Per-API-key rate limits
- Rate limit dashboard
- Dynamic rate limit adjustment
