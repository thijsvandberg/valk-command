# BRDG-342: SSE Connection Budget Across Multiple Open Tabs

**Status:** Refined (scope agreed, not started)
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-338 (live ticket updates), BRDG-243 (per-key ticket events SSE), refinement stream

## Problem

Each open Bridge tab holds one or more long-lived SSE connections: the refinement stream, the per-key ticket events stream (detail pages, Story Writer), and since BRDG-338 the broadcast ticket-events stream (sprint board). Bridge runs over HTTP/1.1 in dev and (without a proxy) in prod, where Chrome caps concurrent connections at ~6 per origin **across all tabs combined**.

Observed during BRDG-338 verification: with 5-7 Bridge tabs open (refinement sessions + ticket details), the connection pool was fully occupied by SSE streams and **new fetches queued indefinitely** - API calls from an open page never reached the server until other tabs were closed.

## Impact

- The PO routinely keeps several Bridge tabs open (board, a few tickets, refinement). Past ~5 tabs, pages can stall on data loading or writes for no visible reason.
- BRDG-338 made live updates work per tab, but each additional subscribed tab spends one connection from the shared budget, so the feature degrades exactly in the multi-tab scenario it was built for.

## Chosen approach (from refinement, 2026-06-12)

Two steps, each independently shippable and testable. Step 1 first because the leader in step 2 is much simpler when there is only one stream to share.

### Step 1 - One merged stream per tab

Consolidate the three server streams into a single `GET /api/events` SSE endpoint carrying every event type (refinement events + ticket:changed), with the event payload identifying its family and ticket key. Client side, a single per-tab connection manager owns the one EventSource; the existing hooks (`useRefinementStream`, `useTicketEvents`, `useTicketEventsStream`) become subscribers on that manager and keep their current signatures and filtering (per-key, broadcast, refinement), so no consumer component changes.

- Spend drops from up to 3 connections per tab to exactly 1.
- The per-key SSE route's server-side filtering moves to the client (the merged stream carries all keys; subscribers filter, as the BRDG-338 board bus already does).
- Existing behaviour (BRDG-243 staleness warning, BRDG-338 live updates + highlight + self-echo suppression, refinement live updates) must be byte-for-byte unchanged. The tab-origin id travels inside the event payload, so self-echo suppression is unaffected.

### Step 2 - One shared stream per browser (leader election)

Lift the connection manager cross-tab: one tab (the "leader") holds the single EventSource for the whole browser and republishes every event on a `BroadcastChannel`; all tabs (leader included) consume from the channel. Leader election via the Web Locks API (`navigator.locks.request` with a well-known lock name): whichever tab holds the lock connects; when it closes, the lock releases and the next waiting tab takes over automatically.

- Total spend: 1 connection regardless of tab count, leaving ~5 lanes free for normal fetches.
- The brief gap during a leader handover is covered by the existing 150s poll fallback; no extra recovery logic needed beyond the existing reconnect.
- No SharedWorker needed; Web Locks + BroadcastChannel are plain APIs, fully supported in Chrome (Bridge is a single-user Chrome tool).

### Explicit non-goal: HTTP/2 proxy

Considered and rejected for this story. After steps 1+2 the starvation problem is gone (1 held connection total); HTTP/2's remaining benefit is only faster parallel API bursts on page load (HTTP/1.1 serves ~6 at a time, HTTP/2 multiplexes all). For local use that would require a local proxy (e.g. Caddy) + self-signed TLS (browsers only do HTTP/2 over HTTPS) + Clerk origin reconfiguration - permanent extra infra on the dev machine for a modest speed gain, while dev-mode latency is dominated by Turbopack compiles anyway. Revisit only if Bridge ever gets a reverse proxy in front of it for other reasons.

## Acceptance Criteria

Step 1:
- [ ] A tab holds at most ONE SSE connection regardless of which views it shows (board, ticket detail, Story Writer, refinement)
- [ ] All existing live behaviours are unchanged: BRDG-338 live updates + per-kind highlight + self-echo suppression, BRDG-243 outdated-draft warning, refinement session live updates
- [ ] Events for ticket X do not trigger handlers subscribed to ticket Y (client-side filtering replaces the per-key route's server-side filtering)
- [ ] Reconnect-on-drop and cleanup-on-unmount behaviour is retained on the merged connection

Step 2:
- [ ] With 8+ Bridge tabs open (mix of board, ticket details, refinement), exactly one SSE connection to the server exists and API calls from any tab still complete promptly
- [ ] Live updates arrive in every subscribed tab, not just the leader
- [ ] Closing the leader tab hands the connection to another tab automatically; live updates resume there without user action
- [ ] A single tab (no other tabs open) behaves exactly as today

## Tests

Step 1:
- [ ] The merged `/api/events` route forwards both refinement and ticket events with their family/key intact
- [ ] One EventSource is created per tab even when multiple hooks subscribe (per-key + broadcast + refinement simultaneously)
- [ ] Per-key subscribers only receive events for their key; broadcast subscribers receive all
- [ ] Existing hook test suites (`useTicketEvents`, `useTicketEventsStream`, `useRefinementStream`) pass against the shared manager without consumer-visible changes
- [ ] Reconnect after drop, cleanup on unmount

Step 2:
- [ ] Only the lock-holding context opens an EventSource; others consume from the BroadcastChannel
- [ ] Events received by the leader are republished and reach channel subscribers
- [ ] On leader release, a waiting context acquires the lock and connects
- [ ] Self-echo suppression still keyed on the per-tab client id (not the leader's)

## Technical Notes

- Existing pieces to consolidate: `src/app/api/refinement-sessions/stream/route.ts`, `src/app/api/tickets/[key]/events/route.ts`, `src/app/api/tickets/events/route.ts`, `src/lib/refinement-events.ts`, `src/lib/ticket-events.ts`, `src/hooks/useRefinementStream.ts`, `src/hooks/useTicketEvents.ts`, `src/hooks/useTicketEventsStream.ts`, `src/lib/live-ticket-changes.ts` (the client bus pattern to generalize).
- The per-tab client id (`src/lib/client-id.ts`) stays per-tab in step 2; only the transport is shared.
- Keep the old routes serving during a transition or remove in the same change - decide during implementation; nothing external consumes them.

## Out of scope

- HTTP/2 / reverse proxy (see non-goal above)
- Any behaviour change to the features riding on these streams
