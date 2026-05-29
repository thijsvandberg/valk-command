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

## Implementation Plan

Decided approach (per Opus planning pass):

1. **Per-user bucket keying** (`src/lib/rate-limiter.ts`, `src/middleware.ts`)
   - Make `applyRateLimit(tier, userIdOverride?)` async, returning `Promise<Response | null>`.
   - Resolve a user segment: use `userIdOverride` if given; otherwise read the `x-bridge-user-id` request header via `headers()` from `next/headers`, wrapped in try/catch with a `"global"` fallback (covers test env and the dev-bypass path where no session exists).
   - Bucket key becomes `` `${tier}:${segment}` `` so each user gets an isolated bucket per tier.
   - `src/middleware.ts` injects `x-bridge-user-id` (the authenticated Clerk `userId`) onto the forwarded request headers, overwriting any client-sent value to prevent spoofing. The header is stripped on public/dev-bypass paths where there is no authenticated user.
   - All 75 existing `const limited = applyRateLimit(` call sites get a mechanical `await` inserted (codemod). Route tests that mock `applyRateLimit` are unaffected (`await null` / `await <Response>` resolve to the same value).

2. **`api/fix-epic-types` POST** — add `await applyRateLimit("write")` guard + import.

3. **`api/scheduler/run/[name]` POST** — add `await applyRateLimit("workspace")` guard + import (fail fast before path validation).

4. **Remove `api/debug/query-stats`** — delete the route file entirely (nothing in the app fetches it; `getQueryStats`/`resetQueryStats` were only consumed here). Per global rule, move to project `deleted/` instead of hard delete.

5. **Request body size limit** — the AC's `next.config` `bodyParser.sizeLimit` is a no-op for App Router route handlers. Real enforcement: a `Content-Length` check in `src/middleware.ts` returning `413` for mutating `/api` requests over 1 MB. Also add `experimental.serverActions.bodySizeLimit: "1mb"` to `next.config.ts` as the documented config touchpoint (covers Server Actions).

6. **Tests** (`src/lib/rate-limiter.test.ts`) — add `await` to real calls; add a per-user bucketing block proving two users get isolated buckets and that a missing userId falls back to a shared `global` bucket.

## Acceptance Criteria

- [x] Rate limiter buckets keyed by user ID (from Clerk session) in addition to tier
- [x] Add `applyRateLimit("write")` to `api/fix-epic-types` POST
- [x] Add `applyRateLimit("workspace")` to `api/scheduler/run/[name]` POST
- [x] Remove `api/debug/query-stats` route entirely (or move to dev-only middleware gate) <!-- moved to deleted/api/debug/query-stats-route.ts per project recover-not-delete rule -->
- [x] Add `bodyParser.sizeLimit` config in `next.config.ts` (e.g., 1 MB) <!-- bodyParser config is a no-op for App Router; real enforcement is a 1 MB Content-Length cap in src/middleware.ts. next.config sets experimental.serverActions.bodySizeLimit for Server Actions. -->
- [x] `npm run build` passes
- [x] `npm run test` passes
- [x] Existing rate-limiter tests updated for per-user bucketing
