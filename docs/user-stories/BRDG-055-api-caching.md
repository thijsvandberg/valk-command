# BRDG-055: API Response Caching Layer

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want server-side caching for frequently accessed endpoints (ticket list, sprint data, metadata) with smart invalidation on sync so pages load instantly on repeat visits.

## Acceptance Criteria

### Phase 1: In-memory cache layer
- [ ] Simple in-memory cache module (Map-based with TTL) in `src/lib/cache.ts`
- [ ] Cache key generation from request URL + query params
- [ ] Configurable TTL per endpoint (default 30 seconds)
- [ ] Max cache size limit (e.g., 100 entries) with LRU eviction

### Phase 2: Apply to high-traffic endpoints
- [ ] Cache `GET /api/tickets` (TTL: 30s)
- [ ] Cache `GET /api/tickets/[key]` (TTL: 60s)
- [ ] Cache `GET /api/jira/sprints` (TTL: 5 minutes)
- [ ] Cache `GET /api/tickets/[key]/dev-info` (TTL: 2 minutes)
- [ ] Cache headers: set `Cache-Control` and `ETag` for client-side caching

### Phase 3: Smart invalidation
- [ ] Invalidate ticket cache entries on Jira sync completion
- [ ] Invalidate specific ticket cache on metadata update
- [ ] Invalidate sprint cache on sprint sync
- [ ] Manual cache flush via `POST /api/cache/flush` (admin action)

### Phase 4: Monitoring
- [ ] Cache hit/miss counters accessible via `GET /api/cache/stats`
- [ ] Log cache hit rate in activity log (periodic, not per request)

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
