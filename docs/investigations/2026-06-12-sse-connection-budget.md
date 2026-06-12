# SSE connection budget across tabs (found during BRDG-338 verification)

**Date:** 2026-06-12
**Context:** Browser verification of BRDG-338 (live ticket updates via SSE)

## Observation

While verifying the live-update chain in Chrome with several Bridge tabs open
(3 refinement views + 2-3 ticket details), `fetch` calls from an open page
stopped reaching the dev server entirely - a `PUT /api/tickets/[key]/metadata`
stayed queued in the browser indefinitely. Closing two tabs released the
requests immediately.

## Cause

Chrome caps concurrent connections per origin at ~6 on HTTP/1.1, shared across
ALL tabs. Every Bridge tab holds at least one long-lived SSE stream:

- refinement views: `/api/refinement-sessions/stream`
- ticket detail / Story Writer: `/api/tickets/[key]/events` (per key)
- sprint board (since BRDG-338): `/api/tickets/events` (broadcast)

5+ tabs ≈ 5-7 held connections, so the pool is exhausted and regular API
calls starve. `next dev` and bare `next start` are HTTP/1.1, so this applies
to the normal local setup.

## What BRDG-338 did about it

The board deliberately uses ONE multiplexed broadcast stream instead of
per-row EventSources, so a single board tab spends 1 connection regardless of
row count. The per-tab spend is the remaining problem.

## Verification evidence (what did work)

- `PUT /api/tickets/VPL-46278/metadata 200` (businessValue 2 -> 3) was followed
  immediately by `GET /api/tickets/VPL-46278 200` from the subscribed detail
  page without any user interaction: emit -> SSE -> revalidate chain confirmed
  live in the real app.
- The per-key stream was held open by the detail page
  (`GET /api/tickets/VPL-46278/events 200 in 300562ms` on disconnect).
- The test value was reverted (businessValue back to 2, via direct DB update
  because the browser's connection pool was starved at that moment).

## Follow-up

Tracked as [BRDG-342](../user-stories/completed/BRDG-342-sse-connection-budget.md)
(implemented 2026-06-12): one unified `/api/events` stream, shared across all
tabs through Web Locks leader election + BroadcastChannel fan-out.

## Unrelated note

During the same session the Turbopack dev server, freshly restarted under open
tabs, served stale chunk hashes to one tab (chunk-load failures for
SearchModal/SidePanel/hmr-client and a crashed error boundary). A hard reload
fixes it; not related to BRDG-338 code.
