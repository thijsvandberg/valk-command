# BRDG-232: Rate Limiter Hardening and Security Gaps

**Status:** Not Started
**Priority:** High
**Type:** Security

## Description

The security audit found several gaps in the API rate limiting and a debug endpoint that should be removed. While the app currently has a single user, these are defense-in-depth measures that prevent abuse if auth is ever compromised or the app is exposed more broadly.

## Findings

### 1. Rate limiter is not per-user (Medium risk)

**File:** `src/lib/rate-limiter.ts`

Rate limit buckets are keyed by tier only (e.g., "write", "read"), not by user or IP. All authenticated sessions share one bucket. A compromised session could exhaust the limit for all users.

### 2. Several routes missing rate limits (Medium risk)

| Route | Method | Issue |
|-------|--------|-------|
| `api/fix-epic-types` | POST | Bulk DB update, no rate limit |
| `api/scheduler/run/[name]` | POST | Triggers scheduled tasks, no rate limit |
| `api/debug/query-stats` | GET | Debug info, no rate limit |

### 3. Debug endpoint exists in production (Low risk)

**File:** `src/app/api/debug/query-stats/route.ts`

Returns query performance stats. It checks `NODE_ENV === "production"` and returns 404 in prod, but the route file still exists and is discoverable. Should be removed entirely or gated behind an additional check.

### 4. No request body size limit (Low risk)

Next.js does not enforce a body size limit by default. A large POST body could cause memory pressure on the server.

## Acceptance Criteria

- [ ] Rate limiter buckets keyed by user ID (from Clerk session) in addition to tier
- [ ] Add `applyRateLimit("write")` to `api/fix-epic-types` POST
- [ ] Add `applyRateLimit("workspace")` to `api/scheduler/run/[name]` POST
- [ ] Remove `api/debug/query-stats` route entirely (or move to dev-only middleware gate)
- [ ] Add `bodyParser.sizeLimit` config in `next.config.ts` (e.g., 1 MB)
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Existing rate-limiter tests updated for per-user bucketing
