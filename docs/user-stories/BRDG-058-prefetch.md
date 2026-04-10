# BRDG-058: Prefetch Adjacent Views

**Status:** Open
**Priority:** Low

## Description

As the PO, I want the app to prefetch data for likely next navigations so transitions between pages feel instant.

## Acceptance Criteria

### Phase 1: Link prefetching
- [ ] Use Next.js `<Link prefetch>` on sidebar navigation links (prefetch on viewport entry)
- [ ] Prefetch ticket detail data when hovering a ticket row on Sprint Board (after 200ms delay)
- [ ] Prefetch adjacent sprint data when on Sprint Board (next/previous sprint slot)

### Phase 2: SWR prefetching
- [ ] Use SWR `preload` to warm the cache for predicted navigations
- [ ] On Sprint Board load: prefetch first 5 ticket details
- [ ] On ticket detail load: prefetch adjacent ticket in the list
- [ ] On chat list load: prefetch most recent conversation

### Phase 3: Intelligent prefetching
- [ ] Only prefetch on fast connections (check `navigator.connection.effectiveType`)
- [ ] Respect data-saver mode
- [ ] Limit concurrent prefetch requests (max 3)
- [ ] Cancel prefetch on navigation away

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
