# BRDG-342: SSE Connection Budget Across Multiple Open Tabs

**Status:** Placeholder
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-338 (live ticket updates), BRDG-243 (per-key ticket events SSE), refinement stream

> Placeholder / draft story. Found during BRDG-338 verification. Scope sketched, to be refined before implementation.

## Problem

Each open Bridge tab holds one or more long-lived SSE connections: the refinement stream, the per-key ticket events stream (detail pages, Story Writer), and since BRDG-338 the broadcast ticket-events stream (sprint board). Bridge runs over HTTP/1.1 in dev and (without a proxy) in prod, where Chrome caps concurrent connections at ~6 per origin **across all tabs combined**.

Observed during BRDG-338 verification: with 5-7 Bridge tabs open (refinement sessions + ticket details), the connection pool was fully occupied by SSE streams and **new fetches queued indefinitely** - API calls from an open page never reached the server until other tabs were closed.

## Impact

- The PO routinely keeps several Bridge tabs open (board, a few tickets, refinement). Past ~5 tabs, pages can stall on data loading or writes for no visible reason.
- BRDG-338 made live updates work per tab, but each additional subscribed tab spends one connection from the shared budget, so the feature degrades exactly in the multi-tab scenario it was built for.

## Possible directions (to refine)

1. **One SSE connection per tab, multiplexed.** Merge the per-key ticket stream, broadcast ticket stream, and refinement stream into a single `/api/events` stream per tab with client-side demultiplexing. Caps the spend at 1 connection per tab.
2. **One SSE connection per browser, shared.** A `SharedWorker` (or `BroadcastChannel` + leader election) owns the single EventSource and fans events out to all tabs. Caps the spend at 1 connection total.
3. **HTTP/2 in front.** Serving over HTTP/2 (e.g. a local Caddy/nginx proxy) lifts the per-origin cap (multiplexed streams). No code change, but adds infra and does not help plain `next dev`.

Option 2 is the most robust; option 1 is the simplest meaningful step and halves or thirds the spend per tab.

## Acceptance Criteria (draft)

- [ ] With 8+ Bridge tabs open (mix of board, ticket details, refinement), API calls from any tab still complete promptly
- [ ] Live updates (BRDG-338) keep working in every subscribed tab in that scenario
- [ ] No regression in SSE reconnect behaviour

## Tests

- [ ] To be defined during refinement
