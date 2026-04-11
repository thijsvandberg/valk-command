# BRDG-061: API Rate Limiting

**Status:** Open
**Priority:** High

## Description

As the app owner, I want rate limiting on all API endpoints so a misconfigured client or runaway script cannot hammer the backend or exhaust Jira API quota.

## Core Concepts

- **Per-endpoint limits**: different limits for different endpoint categories
  - Jira sync endpoints: 1 request per 30 seconds (prevent sync spam)
  - Story writer creation: 5 per minute
  - General read endpoints: 60 per minute
  - General write endpoints: 30 per minute
- **Token bucket algorithm**: smooth rate limiting (not hard window cutoff)
- **Response headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **429 response**: Too Many Requests with `Retry-After` header
- **In-memory tracking**: no external dependency (single-user app)

## Acceptance Criteria

### Phase 1: Rate limiter module
- [ ] Token bucket implementation at `src/lib/rate-limiter.ts`
- [ ] Configurable bucket size and refill rate per endpoint category
- [ ] In-memory `Map` keyed by endpoint path for tracking token state
- [ ] `consume()` method that returns whether the request is allowed
- [ ] `getRemainingTokens()` method for response headers
- [ ] Automatic token refill based on elapsed time since last request
- [ ] Unit tests for token bucket logic (fill, consume, refill, edge cases)

### Phase 2: Apply to Jira sync endpoints
- [ ] Rate limit all `/api/jira/sync*` endpoints to 1 request per 30 seconds
- [ ] Rate limit `/api/jira/sprints` and other Jira read endpoints to 10 per minute
- [ ] Return 429 with clear message when Jira rate limit is exceeded
- [ ] Log rate limit violations for observability

### Phase 3: Apply to story writer and workspace task endpoints
- [ ] Rate limit story writer creation endpoints to 5 per minute
- [ ] Rate limit workspace task submission endpoints appropriately
- [ ] Rate limit scheduler tick endpoint to prevent clock drift issues

### Phase 4: Apply to general read/write endpoints
- [ ] Rate limit general GET endpoints to 60 per minute
- [ ] Rate limit general POST/PUT/PATCH/DELETE endpoints to 30 per minute
- [ ] Ensure rate limits stack correctly (endpoint-specific limit takes precedence over general limit)

### Phase 5: Response headers
- [ ] Add `X-RateLimit-Limit` header (maximum requests allowed in window)
- [ ] Add `X-RateLimit-Remaining` header (requests remaining in current window)
- [ ] Add `X-RateLimit-Reset` header (Unix timestamp when limit resets)
- [ ] Headers present on all API responses (not just 429)

### Phase 6: 429 response with Retry-After
- [ ] Return HTTP 429 status code when rate limit exceeded
- [ ] Include `Retry-After` header with seconds until next allowed request
- [ ] JSON response body with user-friendly error message
- [ ] Frontend handles 429 gracefully (show message, disable retry button temporarily)

## Technical Notes

- Implement as a utility wrapper or higher-order function for API route handlers
- Token bucket stored in-memory `Map` keyed by endpoint path
- Jira API has its own rate limits; our limits should be stricter to stay within their budget
- Story writer uses workspace resources; rate limiting prevents overloading the agent
- Consider a rate limit for the scheduler tick endpoint to prevent clock drift issues
- Reset counters on server restart (acceptable for single-user app)
- Token bucket is preferred over fixed window because it handles burst traffic more gracefully

## Out of Scope (for now)

- IP-based rate limiting
- User-based rate limiting
- Distributed rate limiting (Redis-backed)
- Rate limit dashboard or analytics
- Dynamic rate limit adjustment based on upstream API health
