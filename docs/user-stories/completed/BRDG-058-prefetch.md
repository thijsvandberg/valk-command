# BRDG-058: Prefetch Adjacent Views

**Status:** Done
**Priority:** Low

## Description

As the PO, I want the app to prefetch data for likely next navigations so transitions between pages feel instant.

## Acceptance Criteria

### Phase 1: Link prefetching
- [x] Use Next.js `<Link prefetch>` on sidebar navigation links (prefetch on viewport entry)
- [x] Prefetch ticket detail data when hovering a ticket row on Sprint Board (after 200ms delay)
- [x] Prefetch adjacent sprint data when on Sprint Board (next/previous sprint slot)

### Phase 2: SWR prefetching
- [x] Use SWR `preload` to warm the cache for predicted navigations
- [x] On Sprint Board load: prefetch first 5 ticket details
- [x] On ticket detail load: prefetch adjacent ticket in the list
- [x] On chat list load: prefetch most recent conversation

### Phase 3: Intelligent prefetching
- [x] Only prefetch on fast connections (check `navigator.connection.effectiveType`)
- [x] Respect data-saver mode
- [x] Limit concurrent prefetch requests (max 3)
- [x] Cancel prefetch on navigation away

## Technical Notes

- Next.js App Router `<Link>` already prefetches by default for static pages; ensure it works for dynamic routes
- SWR `preload(key, fetcher)` warms cache without triggering re-renders
- Hover prefetch: use `onMouseEnter` with a debounced timer (cancel on `onMouseLeave`)
- Monitor network tab in dev tools to verify prefetch is working correctly

## Out of Scope (for now)
- Service worker-level prefetching
- Predictive prefetching based on usage patterns
- Preloading images or attachments
- Background sync prefetch
