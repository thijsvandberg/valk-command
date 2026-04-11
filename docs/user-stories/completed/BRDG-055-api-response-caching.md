# BRDG-055: API Response Caching Layer

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want server-side caching for frequently accessed endpoints so pages load instantly on repeat visits.

## Core Concepts

- **In-memory cache**: LRU cache for hot endpoints (ticket list, sprint data, metadata)
- **Cache invalidation**: Automatic invalidation when data changes (after sync, after edit)
- **Cache headers**: Appropriate HTTP cache-control headers for client-side caching
- **Stale-while-revalidate**: Serve stale data while refreshing in background
- **Cache keys**: Based on endpoint + query parameters + sprint context
- **Metrics**: Log cache hit/miss rates for monitoring

## Acceptance Criteria

### Phase 1: LRU cache module
- [ ] Singleton LRU cache module with `get`, `set`, `invalidate`, and `clear` methods
- [ ] Configurable max entries (default 100) and per-key TTL support
- [ ] Automatic eviction of least recently used entries when cache is full
- [ ] Unit tests for all cache operations including eviction and TTL expiry

### Phase 2: Cache integration on key endpoints
- [ ] Cache wrapper for `/api/tickets` (with sprint filter as part of cache key), TTL 30s
- [ ] Cache wrapper for `/api/jira/sprints`, TTL 5min
- [ ] Cache wrapper for `/api/tickets/[key]`, TTL 10s
- [ ] Cache keys incorporate query parameters and sprint context to avoid serving wrong data

### Phase 3: Cache invalidation on mutations
- [ ] Invalidate relevant ticket cache entries when ticket metadata is updated
- [ ] Invalidate ticket list cache when sync completes
- [ ] Invalidate sprint cache when sprint data changes
- [ ] Bulk `clear` call available for full cache reset (e.g., after a full Jira sync)

### Phase 4: HTTP cache-control headers
- [ ] Set `Cache-Control: private, max-age=30, stale-while-revalidate=60` on ticket list responses
- [ ] Set `Cache-Control: private, max-age=300, stale-while-revalidate=600` on sprint data responses
- [ ] Set `Cache-Control: no-store` on mutation endpoints (POST, PATCH, DELETE)
- [ ] Verify headers are correct using browser DevTools network tab

### Phase 5: Cache metrics logging
- [ ] Log cache hit/miss counts per endpoint to activity log
- [ ] Include cache hit rate in periodic summary (e.g., every 100 requests)
- [ ] Log cache evictions and invalidations for debugging

## Technical Notes

- Simple Map-based LRU cache in a singleton module (no Redis needed for single-user app)
- Invalidation hooks in sync and mutation API routes
- SWR on the frontend already handles client-side caching; this is the server-side complement
- Most impactful endpoints: `/api/tickets` (with sprint filter), `/api/jira/sprints`, `/api/tickets/[key]`
- Cache TTL: 30s for ticket lists, 5min for sprint data, 10s for ticket detail
- Cache size limit to prevent memory issues (max 100 entries)

## Out of Scope (for now)

- Redis or any external cache service
- CDN caching
- Cache warming on server start
- Distributed cache for multi-instance deployments
