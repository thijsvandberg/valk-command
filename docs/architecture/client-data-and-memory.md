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

**Custom-provider corollary (BRDG-458):** because the cache is a custom provider,
the `mutate` imported directly from `"swr"` targets SWR's *default* cache and is a
silent no-op against every hook here. Always mutate through `useSWRConfig().mutate`,
a hook's own `mutate`, or — in non-hook modules — `scopedMutate` from
[swr-scoped-mutate.ts](../../src/lib/swr-scoped-mutate.ts) (registered by
`SWRProvider` on mount). A lint rule enforces this;
see [optimistic-updates.md](optimistic-updates.md) for the full story.

### 2. Never fetch the whole backlog client-side

`useTickets("__all__")` pulls every ticket into the browser. It is an
anti-pattern. Fetch only what the screen needs:

- For a **bounded, known set of keys**, use
  [`useTicketsByKeys(keys)`](../../src/hooks/useSprintBoard.ts) (resolves each via
  the single-ticket endpoint, tolerates 404s).
- For **hover-card data on reference rows** (epic children, linked issues, link
  search, refinement queue), use the on-demand
  [`useHoverData(keys)`](../../src/hooks/useTicketHoverData.ts) +
  `<HoverDataProvider keys={…}>` pattern: the container collects its visible keys
  and one batched `GET /api/tickets/hover?keys=…` resolves just those, returning
  only the `buildTicketHoverData` shape. Reference rows keep calling
  `useTicketHoverData()` unchanged; it now reads the provider's bounded lookup
  instead of the whole backlog (BRDG-412).
- For **search/browse over the whole pool**, add a server-side filtered/searched
  endpoint and page the results; do not load everything and filter on the client.

[BRDG-412](../user-stories/completed/BRDG-412-hover-lookup-on-demand.md) removed
the app-wide `useTickets("__all__")` that the shared hover lookup used to keep
alive on every ticket-detail page (the change BRDG-391 could not make in safe
pieces). The only remaining `__all__` callers are deliberate **browse-all views**
where the PO explicitly asks for every ticket: the board "All view"
([SprintBoard.tsx](../../src/components/sprint-board/SprintBoard.tsx)) and the
refinement prep board
([RefinementPageContent.tsx](../../src/components/refinement-session/RefinementPageContent.tsx),
which searches/filters the full candidate pool to build a session). Narrowing the
prep board to a server-side searched endpoint is a separate follow-up. BRDG-411
already dropped the 60s auto-refresh on the `__all__` key, so these views fetch
once per load, not on a poll.

### 3. Virtualize every growable list

Any list whose row count can grow (boards, queues, inbox, cleanup, search) must be
windowed (`@tanstack/react-virtual`) so only visible rows mount to the DOM. The
flat Sprint Board and the Cleanup list
([BRDG-393](../user-stories/completed/BRDG-393-virtualize-remaining-lists.md)) do this
above 40 rows. The grouped Sprint Board windows rows INSIDE each expanded group card
past 100 total expanded rows
([BRDG-452](../user-stories/completed/BRDG-452-virtualize-grouped-all-view.md)): one
virtualizer per group (`VirtualizedGroupRows.tsx`), card chrome and headers stay real
DOM, and off-viewport groups collapse to a single spacer row (virtual-core clamps
out-of-view ranges to the nearest edge instead of returning an empty range, so the
component gates on real viewport overlap itself). Droppable measuring flips to
`Always` while windowed so rows mounting under mid-drag auto-scroll are measured
(BRDG-347).

**Prod-only attach deadlock (BRDG-452, read before touching any useVirtualizer):** on
first mount a descendant's layout effects run BEFORE an ancestor's ref attaches, so
`getScrollElement: () => someAncestorRef.current` returns null at attach time;
tanstack silently skips attaching its scroll/rect observers and only retries on a
later render. Dev never shows this (StrictMode re-runs effects after refs attach); on
a prod build a virtualizer can stay permanently scroll-dead. Both board paths
therefore resolve the scroll element into STATE via a passive effect (refs are
attached by then, and the state change guarantees the re-render tanstack needs) and
pass `initialOffset: () => el?.scrollTop ?? 0` so a late attach does not scroll the
shared container to 0 (`_willUpdate` ends with `_scrollToOffset(getScrollOffset())`).
Per-group `scrollMargin`s additionally self-heal on scroll (rAF-throttled re-measure)
because layout shifts between a group's mount and later settles do not fire any
observed resize. The Inbox and the Refinement queue still render all rows; virtualizing
them was reviewed and not pursued (memory is bounded by the cap, so it is a perf
nice-to-have).

## Surfacing fetch errors (every SWR surface)

SWR does not throw, so a failed fetch never reaches the `error.tsx` /
`ErrorBoundary` layer. A surface that ignores SWR's `error` renders a permanent
blank/empty screen with no retry. Every primary data view must read `error` and
render the shared
[`DataErrorState`](../../src/components/shared/DataErrorState.tsx)
([BRDG-423](../user-stories/completed/BRDG-423-data-state-coverage.md)):

- `variant="inline"` (default) — a banner over content that is still shown (cached
  or partial data); use when `error && data`.
- `variant="full"` — a centered retry screen that replaces an empty view; use when
  `error && !data`.

Both take `onRetry` (wire it to the hook's `mutate`) and compose the existing
`EmptyState` / `InlineAlert` primitives as-is. Do **not** swallow failures in a
fetcher (`.catch(() => null/[])`): that makes a real error indistinguishable from
"no data". The reference pattern is `chat/ConversationList.tsx`.

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
