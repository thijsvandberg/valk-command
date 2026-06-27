# BRDG-417: Re-audit long-tail — deferred sync/polling hygiene follow-ups

**Status:** Not Started
**Priority:** Low
**Type:** Performance / Stability — sync, polling, contexts

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
flagged a handful of Low-severity hygiene items that were consciously left out of their parent stories
([[BRDG-408-finish-jira-sync-n-plus-one]], [[BRDG-410-polling-and-memory-hygiene]]) because they were
either larger than the parent's scope, genuinely low-impact, or carried regression risk without a
clear test. They are collected here so they are not lost; each is independent and can be picked up on
its own.

## Items, with the trade-off behind each deferral

### 1. Burnup-seed per-ticket changelog fetch (from BRDG-408)

[burnup/seed/route.ts:150-152](../../src/app/api/burnup/seed/route.ts) loops
`getBurnupChangelog(key)` once per ticket. This is the only surviving N+1 from the sync cleanup.

- **Why deferred:** it is an on-demand seed (not a hot path), and the loop interleaves the per-ticket
  fetch with per-ticket DB writes + shared counters/sets, so bounding its concurrency means
  restructuring the loop — more regression risk than a Low item warranted mid-sprint.
- **Approach:** either fetch with `expand=changelog` in bulk via `getIssuesByKeys` (now chunked,
  BRDG-408) and parse the changelog locally, or fetch the changelogs with the `mapWithConcurrency`
  worker pattern already used in `pipeline-sync.ts`, then process the results sequentially. Preserve
  the idempotent "already seeded" skip and the status/scope-change recording exactly.

### 2. `useConversations` / `useMessages` hand-rolled polling → SWR (from BRDG-410)

[useConversations.ts:47-64](../../src/hooks/useConversations.ts) and
[useMessages.ts:76-112](../../src/hooks/useMessages.ts) poll via `setInterval` + `setState` instead of
SWR, so the two consumers are undeduped when both mount, the cache is not LRU-bounded, and they do not
pause on hidden tabs.

- **Why deferred:** the BRDG-410 Open Question explicitly recommended a follow-up — it is the largest
  change in that set because it requires porting the optimistic create / delete / mark-read logic to
  `mutate` / `populateCache`.
- **Approach:** migrate both to SWR (key per conversation / message list, `refreshInterval` +
  `revalidateOnFocus`, so they inherit dedupe + hidden-tab pause + the LRU-bounded provider); port the
  optimistic operations to `mutate(..., { optimisticData, rollbackOnError })`. Verify chat send /
  delete / mark-read still feel instant.

### 3. event-bus + RefinementSessionContext edges (from BRDG-410)

- `event-bus.ts:104-110` double-dispatches in the **rare** BroadcastChannel-without-WebLocks fallback
  (a tab opens its own EventSource AND re-dispatches the rebroadcast).
- `RefinementSessionContext.tsx:69` index-persist timer is not cleared on unmount.

- **Why deferred:** the event-bus path is cross-tab leadership code with no test and a rare trigger —
  changing it speculatively is risky without a repro. The RefinementSessionContext timer fires a
  fire-and-forget API call that **persists the session's current index** — that post-unmount write is
  arguably *wanted* (it saves your place when you navigate away), so clearing it could lose data.
- **Approach:** for event-bus, guard the fallback re-post so a tab that holds (or lacks) leadership
  does not double-deliver; add a focused test for the no-WebLocks branch. For
  RefinementSessionContext, first decide whether the post-unmount persist is desired — if it is
  (likely), leave it and document the intent; only clear the timer on unmount if a concrete case shows
  the write is unwanted.

## Acceptance Criteria

- [ ] Burnup seed issues a bounded number of Jira calls (bulk or bounded-concurrency), not one
      `getBurnupChangelog` per ticket; the seeded status/scope changes are identical to before.
- [ ] `useConversations` / `useMessages` are SWR-backed: deduped across consumers, hidden-tab-paused,
      LRU-bounded; chat optimistic create/delete/mark-read still work.
- [ ] The event-bus no-WebLocks fallback does not double-dispatch an event.
- [ ] A decision is recorded for the RefinementSessionContext timer (kept-as-wanted, or cleared with
      a reason).

## Tests

- [ ] Burnup seed test: a multi-ticket seed triggers bounded fetches and records the same rows.
- [ ] Conversations/messages SWR test: two mounts dedupe to one request; an optimistic op reflects
      immediately and rolls back on failure.
- [ ] event-bus test: the no-WebLocks fallback dispatches each event exactly once.

## Open Questions

- **One story or three?** These are independent; this story groups them only to keep the backlog
  tidy. Split into separate stories if any one grows beyond its Low estimate.

## Related

- [[2026-06-25-refactor-reaudit]] — source audit.
- [[BRDG-408-finish-jira-sync-n-plus-one]] — parent of item 1.
- [[BRDG-410-polling-and-memory-hygiene]] — parent of items 2 and 3.
- Touch points: `burnup/seed` route, `useConversations.ts`, `useMessages.ts`, `event-bus.ts`,
  `RefinementSessionContext.tsx`.
