# Client Data Fetching & Memory

How Bridge keeps a long-lived browser tab from growing without bound. Read this
before adding a new SWR fetch, a new list view, or a field to the ticket payload.
Origin: [BRDG-387](../user-stories/completed/BRDG-387-frontend-memory-guardrails.md).

## The problem

Tabs stay open for hours. SWR's default cache is an unbounded `Map`: every
distinct key a tab ever fetches (each sprint board, each ticket detail, each
refinement conversation) stays resident for the life of the tab, and a shared SSE
stream ([event-bus.ts](../../src/lib/event-bus.ts)) constantly revalidates. Left
unchecked, a single tab climbed to 1-2 GB.

## Three guardrails

### 1. The SWR cache is bounded (access-order LRU)

[src/lib/swr-lru-provider.ts](../../src/lib/swr-lru-provider.ts) replaces SWR's
default provider with an access-order LRU, wired in
[SWRProvider.tsx](../../src/components/SWRProvider.tsx).

- **Access-order:** every `get`/`set` moves the key to most-recently-used. The
  head of the order is the eviction candidate.
- **Soft cap (`DEFAULT_MAX_ENTRIES = 300`):** above the cap, the oldest evictable
  key is dropped. 300 sits comfortably above a realistic working set (the open
  board list + a few sprint lists + ~30 detail keys + pickers + refinement data).
- **Freshness window (`DEFAULT_FRESHNESS_MS = 60_000`):** a key touched within the
  window is never evicted, even over cap, so a key with an active-but-idle
  subscriber is never pulled out from under its component. The cap is therefore a
  *soft* ceiling the working set may briefly exceed.
- **`$`-prefixed keys are never counted or evicted.** SWR namespaces its own
  module bookkeeping with `$` (`$inf$` for `useSWRInfinite`, `$sub$` for
  `useSWRSubscription`). None are used today; the guard is defensive. **Do not
  remove it** if either is introduced later.

**Why eviction is safe (no snap-back, no lost edits):**

1. Per-key subscriber/revalidator bookkeeping lives in SWR's `WeakMap` keyed by
   the cache *object*, not as entries in the cache, so dropping a data key never
   orphans subscriber state.
2. The optimistic snap-back overlay lives **outside** SWR, in module-level Maps
   read via `useSyncExternalStore`
   ([pendingTicketEdits.ts](../../src/components/sprint-board/pendingTicketEdits.ts),
   [pendingSprintMoves.ts](../../src/components/sprint-board/pendingSprintMoves.ts)),
   and is re-applied over the list on every render. An eviction of the list key
   only forces a refetch; the overlay re-applies on top regardless. See
   [optimistic-updates.md](optimistic-updates.md).
3. Every `{ revalidate: false }` cache patch (see
   [ticket-cache.ts](../../src/lib/ticket-cache.ts)) mirrors a write that also went
   to the server, so an evicted *cold* key re-fetches correct server data.

The only trade-off is UX, not correctness: returning to a view whose key was
already evicted shows a brief loading flash instead of `keepPreviousData`'s instant
swap. Sizing the cap above the working set avoids it in practice.

### 2. Never fetch the whole backlog client-side

`useTickets("__all__")` pulls every ticket into the browser. It is an
anti-pattern. Fetch only what the screen needs:

- For a **bounded, known set of keys**, use
  [`useTicketsByKeys(keys)`](../../src/hooks/useSprintBoard.ts) (resolves each via
  the single-ticket endpoint, tolerates 404s).
- For **search/browse over the whole pool**, add a server-side filtered/searched
  endpoint and page the results; do not load everything and filter on the client.

Remaining `__all__` sites are tracked in
[BRDG-388](../user-stories/BRDG-388-scope-remaining-all-tickets-fetches.md).

### 3. Virtualize every growable list

Any list whose row count can grow (boards, queues, inbox, cleanup, search) must be
windowed (`@tanstack/react-virtual`) so only visible rows mount to the DOM. The
flat Sprint Board already does this above 40 rows. Open gaps: the grouped Sprint
Board ([BRDG-389](../user-stories/BRDG-389-virtualize-grouped-sprint-board.md)) and
the Refinement/Inbox/Cleanup lists
([BRDG-390](../user-stories/BRDG-390-virtualize-remaining-lists.md)).

## The list-vs-detail payload split (invariant)

The `/api/tickets` **list** payload carries summary fields only (the `Ticket`
shape). Heavy fields, full ADF `description`, `jiraComments`, `attachments`,
`subtasks`, live on `TicketDetail` and load lazily from the per-ticket detail
endpoint when a ticket is opened. This keeps the board feed light no matter how
many tickets it returns.

This invariant is locked by a test in
[src/app/api/tickets/route.test.ts](../../src/app/api/tickets/route.test.ts)
("list payload carries summaries only"). **Do not add detail fields to the list
response** to satisfy a single view; fetch the detail for that view instead.
