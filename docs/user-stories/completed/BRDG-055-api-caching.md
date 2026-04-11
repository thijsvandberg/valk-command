# BRDG-055: API Response Caching Layer

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want server-side caching for frequently accessed endpoints (ticket list, sprint data, metadata) with smart invalidation on sync so pages load instantly on repeat visits.

## Acceptance Criteria

### Phase 1: In-memory cache layer
- [x] Simple in-memory cache module (Map-based with TTL) in `src/lib/cache.ts`
- [x] Cache key generation from request URL + query params
- [x] Configurable TTL per endpoint (default 30 seconds)
- [x] Max cache size limit (e.g., 100 entries) with LRU eviction

### Phase 2: Apply to high-traffic endpoints
- [x] Cache `GET /api/tickets` (TTL: 30s)
- [x] Cache `GET /api/tickets/[key]` (TTL: 60s)
- [x] Cache `GET /api/jira/sprints` (TTL: 5 minutes)
- [x] Cache `GET /api/tickets/[key]/dev-info` (TTL: 2 minutes)
- [x] Cache headers: set `Cache-Control` and `ETag` for client-side caching

### Cache safety rules
- [x] Cache only applies to `GET` requests; all mutating operations (`POST`/`PUT`/`PATCH`/`DELETE`) bypass the cache entirely
- [x] Write operations that push to Jira must always fetch the latest version from Jira API before mutating (never use cached data)
- [x] Cache hit serves the original response including original timestamps; `lastUpdated` is never altered by a cache hit

### Phase 3: Smart invalidation
- [x] Invalidate ticket cache entries on Jira sync completion
- [x] Invalidate specific ticket cache on metadata update
- [x] Invalidate sprint cache on sprint sync
- [x] Manual cache flush via `POST /api/cache/flush` (admin action)

### Phase 4: Monitoring
- [x] Cache hit/miss counters accessible via `GET /api/cache/stats`
- [x] Log cache hit rate in activity log (periodic, not per request)

## Technical Notes

- Start with simple in-memory Map; upgrade to Redis only if needed for multi-process
- Next.js running single-process, so in-memory cache is sufficient
- Use `stale-while-revalidate` pattern: serve stale data while refreshing in background
- Invalidation events triggered from sync API routes (call `cache.invalidate(pattern)`)

## Out of Scope (for now)
- Redis or external cache store
- Per-user cache (single user app)
- Full-page caching (Next.js ISR)
- CDN-level caching
