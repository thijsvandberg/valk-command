# BRDG-387: Frontend memory guardrails — bound the SWR cache and stop over-fetching

**Status:** To Do
**Priority:** High

## Description

As the Product Owner, I keep Bridge tabs open all day. Over a long session a single tab climbs to **1-2 GB** of memory (observed: a Sprint Board tab at 2.3 GB, a Refinement tab at 1.0 GB), which slowly starves the machine and makes everything sluggish. Reloading the tab reclaims it, but that is a workaround.

I want two things, so this cannot keep recurring:

1. **A structural cap on the client data cache** so memory cannot grow without bound, no matter how long a tab stays open or how many screens I visit. One change that protects every view, present and future.
2. **Architecture rules (and the matching fixes) that stop individual screens from loading far more data than they show** — no fetching the whole backlog into the browser, and every growable list must be virtualized.

This story covers **both**. The investigation that grounds it is included below, because the cap touches shared infrastructure and we must be sure it does not break the optimistic-edit behaviour that the board depends on.

## Background: how the app works today (root cause)

Three facts combine into the slow memory climb:

1. **The SWR cache never evicts.** [SWRProvider.tsx:16-25](src/components/SWRProvider.tsx#L16-L25) configures SWR with the **default in-memory provider (a plain `Map` with no size limit)** plus `keepPreviousData: true`. Every *distinct* key the tab ever fetches — each sprint board you open, each ticket detail, each refinement conversation — stays resident for the life of the tab. Nothing trims it. (Re-fetching the *same* key overwrites it, so the growth is across *distinct* keys, not versions.)

2. **A shared SSE stream constantly revalidates.** [event-bus.ts](src/lib/event-bus.ts) runs one browser-wide `EventSource`; the tab holding the `bridge-events-leader` Web Lock owns it ([event-bus.ts:92-106](src/lib/event-bus.ts#L92-L106)). Every ticket change anywhere triggers SWR `mutate` calls, which re-fetch and re-render. That leader tab is the one observed burning idle CPU and network in Chrome's Task Manager.

3. **Two screens amplify it by loading more than they display:**
   - The **grouped Sprint Board bypasses row virtualization** ([TicketTable.tsx:384](src/components/sprint-board/TicketTable.tsx#L384) gates virtualization on a flat list; the grouped path at [~L247/L673](src/components/sprint-board/TicketTable.tsx#L247) renders every row of every group to the DOM).
   - **Refinement and several modals fetch the entire backlog** via `useTickets("__all__")` even though they show ~30 rows ([RefinementPageContent.tsx:114](src/components/refinement-session/RefinementPageContent.tsx#L114)).

## Where this has effect

### Whole-backlog fetches (`useTickets("__all__")`) — Rule A targets

| File:Line | Screen | Notes |
|---|---|---|
| [useTicketHoverData.ts:45](src/hooks/useTicketHoverData.ts#L45) | **Global hover cards** | Highest impact: mounted broadly, pulls the full backlog wherever hover is active |
| [RefinementPageContent.tsx:114](src/components/refinement-session/RefinementPageContent.tsx#L114) | Refinement prep queue | Held for the whole session, indexed into a Map |
| [SessionEndModal.tsx:48](src/components/refinement-session/SessionEndModal.tsx#L48) | Session end / carry-over modal | Full list for modal lifetime |
| [SessionWrapUpCelebration.tsx:132](src/components/refinement-session/SessionWrapUpCelebration.tsx#L132) | Session wrap-up modal | Full list for modal lifetime |
| [refinement/[sessionId]/session/[ticketKey]/page.tsx:87](src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx#L87) | In-session ticket detail | Duplicate full fetch on drill-down |
| [LinkedIssuesSection.tsx:76](src/components/ticket-detail/LinkedIssuesSection.tsx#L76) | Ticket detail side panel | Full list just to cross-reference linked issues |

### Growable lists and their virtualization status — Rule B targets

| List | File | Virtualized? |
|---|---|---|
| Sprint Board, flat view | [TicketTable.tsx](src/components/sprint-board/TicketTable.tsx) | Yes (>40 rows, `@tanstack/react-virtual`) |
| **Sprint Board, grouped view** | [TicketTable.tsx:~673](src/components/sprint-board/TicketTable.tsx#L673) | **No — renders all rows (critical gap)** |
| Refinement ticket queue | [RefinementTicketList.tsx:196](src/components/refinement-session/RefinementTicketList.tsx#L196) | No (plain `.map()`) |
| Inbox new-stories | [inbox/page.tsx:87](src/app/(app)/inbox/page.tsx#L87) | No |
| Cleanup candidates | [cleanup/page.tsx](src/app/(app)/cleanup/page.tsx) | No |
| Activity log | [activity-log/ActivityTable.tsx](src/app/(app)/activity-log/ActivityTable.tsx) | No, but paginated (bounded) |
| Epic / Assignee pickers | [EpicPicker.tsx](src/components/shared/EpicPicker.tsx), [AssigneePicker.tsx](src/components/shared/AssigneePicker.tsx) | No (load all options per open) |

## Part 1 — Bound the SWR cache (the structural fix)

Replace SWR's default unbounded `Map` with a **bounded, access-order LRU** provider in [SWRProvider.tsx](src/components/SWRProvider.tsx): on read and write, mark the key most-recently-used; when the entry count exceeds the cap, evict the least-recently-used key. SWR re-fetches an evicted key automatically the next time something reads it.

### Will the cap break anything? (the key question)

**Verdict: it is safe for correctness.** Two independent investigations initially disagreed (one flagged "8 critical write-through patterns"; the other said pending edits live outside SWR). Reconciling them with the code resolves it decisively:

1. **The snap-back protection does NOT live in the SWR cache.** Optimistic board edits and sprint moves are held in **module-level Maps exposed via `useSyncExternalStore`** — [pendingTicketEdits.ts:63](src/components/sprint-board/pendingTicketEdits.ts#L63) and [pendingSprintMoves.ts:30](src/components/sprint-board/pendingSprintMoves.ts#L30) — and re-applied on top of the list on **every render** ([SprintBoard.tsx](src/components/sprint-board/SprintBoard.tsx), `applyPendingEdits`/`applyPendingMoves`). This is exactly why the overlay was built that way (see [optimistic-updates.md](docs/architecture/optimistic-updates.md)). **An SWR eviction physically cannot touch these stores.** The snap-back bug class stays fixed.

2. **LRU only evicts the *least-recently-used* keys = views nothing is currently rendering.** The board you are looking at, the detail you have open, the picker you just opened — all are read continuously (render + 60s poll + focus revalidation), so they are the *most*-recently-used and are never eviction candidates. Eviction targets cold keys for screens you navigated away from.

3. **Every `{ revalidate: false }` cache patch is an optimistic *mirror* of a write that also went to the server.** The patches in [ticket-cache.ts](src/lib/ticket-cache.ts) (`patchTicketCaches`, `moveTicketSprintCaches`, `patchTicketDetailCache`), [usePlaceholders.ts](src/hooks/usePlaceholders.ts), [useSavedSearches.ts](src/hooks/useSavedSearches.ts), [WatchersRow.tsx](src/components/shared/WatchersRow.tsx), and [useTicketEditStateSync.ts](src/hooks/useTicketEditStateSync.ts) bridge the read-after-write lag. If a *cold* key carrying such a patch is evicted, re-visiting it re-fetches **correct server data** (the edit was persisted server-side; `editState`/draft labels are server-persisted too). So an evicted patch self-heals rather than breaking.

4. **No paginated state to lose.** There is **no `useSWRInfinite`** anywhere in `src/`, so eviction cannot reset scroll/pagination position.

**The one real trade-off (not a correctness bug):** returning to a screen whose key was *already evicted* loses the `keepPreviousData` instant in-place swap and shows a brief loading flash before fresh data arrives. This only happens if the working set exceeds the cap. Mitigation is sizing, not logic.

### Design requirements that follow from the analysis

- **Access-order LRU** (touch on both get and set) so actively-read keys are never the eviction target.
- **Size generously, above the realistic working set.** Start at **~300 keys** (not 150): a heavy session realistically holds an active board + a few sprint lists + ~30 open details + pickers + refinement data with margin. 300 is comfortably above that while still capping unbounded growth.
- **Edge to guard:** a key with an active subscriber that is briefly idle (no recent read/poll) must not be evicted out from under its component. Sizing above the working set covers this in practice; optionally protect any key accessed within the longest `refreshInterval` (60s). Add a test for "evict cold key, keep warm key."
- The backend response cache ([lib/cache.ts](src/lib/cache.ts), `MAX_ENTRIES=200`, server-side) is unrelated and unchanged.

### Alternatives considered (and why not)

- **Drop `keepPreviousData` globally:** reduces retention but causes loading flashes across *all* navigation, a broad UX regression for a smaller memory win. Rejected.
- **TTL/age-based eviction:** evicts by age regardless of use, so it can drop a screen you are actively viewing. LRU-by-use is strictly better here.

## Part 2 — Rules and targeted fixes (so it cannot recur)

Add three rules to the architecture docs and apply them to the worst offenders. These are the prevention; Part 1 is the safety net.

**Rule A — never load the whole backlog client-side.** `useTickets("__all__")` is banned in views. Fetch a server-filtered/summary set scoped to what the screen needs.
- Fix the 6 sites in the table above. Prioritise [useTicketHoverData.ts:45](src/hooks/useTicketHoverData.ts#L45) (fetch per-key on hover instead of the full list) and [RefinementPageContent.tsx:114](src/components/refinement-session/RefinementPageContent.tsx#L114) (fetch refinement-eligible tickets + the session's own keys only).

**Rule B — every growable list is virtualized.** No exceptions, including grouped views.
- Fix the grouped Sprint Board (the known gap), [RefinementTicketList.tsx](src/components/refinement-session/RefinementTicketList.tsx), and Inbox/Cleanup lists.

**Rule C — heavy fields (full ADF description, comments) are lazy-loaded on detail open, never shipped in list payloads.** Audit the `/api/tickets` list response and confirm list rows carry summaries only; details come from the per-key endpoint.

**Documentation.** Add a new architecture doc `docs/architecture/client-data-and-memory.md` capturing the cache-cap contract and Rules A/B/C, and link it from [docs/index.md](docs/index.md) and the architecture list in [CLAUDE.md](CLAUDE.md).

## Implementation Plan

Produced with an Opus planning pass against the real code (SWR 2.4.1). Key findings that shape scope:

- **SWR `provider` contract** (`swr@2.4.1`): `provider?: (cache) => Cache`, where `Cache` needs exactly `keys()`, `get(key)`, `set(key, value)`, `delete(key)`. The factory receives the existing default Map and returns the replacement.
- **Eviction is safe at the SWR level**: per-key subscriber/revalidator bookkeeping lives in a `WeakMap` keyed by the cache *object*, not as `$`-entries in the Map. So evicting a data key never orphans subscriber state. There is **no `useSWRInfinite`/`useSWRSubscription`** in `src/`, so no `$inf$`/`$sub$` keys today; the LRU still defensively excludes any `$`-prefixed key from counting/eviction.
- **Checkbox 7 is already satisfied** — the `/api/tickets` list payload is built from the `Ticket` interface ([route.ts:131-157](src/app/api/tickets/route.ts#L131-L157), [types/ticket.ts:254-287](src/types/ticket.ts#L254-L287)); it carries **no** `description`/`jiraComments`/`attachments`. ADF/comments live on `TicketDetail` and load on detail open. This becomes a verify + assertion, not a code change.
- **Checkbox 2 is structurally already true** — overlays are re-applied over `apiTickets` on every render in [SprintBoard.tsx:269-276](src/components/sprint-board/SprintBoard.tsx#L269-L276). Work = a test that proves survival across stale-refetch *and* eviction.

### In this PR

1. **`src/lib/swr-lru-provider.ts` (NEW)** — `createLruProvider({ maxEntries = 300, freshnessMs = 60_000 })`. Native `Map` as access-order LRU (delete+re-set on `get`/`set` to move to tail). Protect `$`-prefixed keys. Soft cap: evict oldest evictable key whose last touch is older than `freshnessMs`; never evict a fresh or protected key (so a key with an active-but-idle subscriber is not pulled out from under it). Framework-agnostic, no React imports. (Checkboxes 1, 3)
2. **Wire into [SWRProvider.tsx:16](src/components/SWRProvider.tsx#L16)** — add `provider: createLruProvider()`, keep `keepPreviousData`/`dedupingInterval`/`revalidateOnFocus`/`fetcher`.
3. **`src/lib/swr-lru-provider.test.ts` (NEW)** — access-order touch, cap enforcement (`freshnessMs:0`), `$`-key protection, freshness guard, `keys()` returns all live data keys. Plus an integration test: pending overlay value survives both a stale refetch and a forced eviction of the list key. (Checkbox 2)
4. **Drop-in `__all__` removals** (scoped to bounded key sets via existing `useTicketsByKeys`):
   - [LinkedIssuesSection.tsx:76](src/components/ticket-detail/LinkedIssuesSection.tsx#L76) → `useTicketsByKeys(issues.map(i => i.key))`
   - [SessionEndModal.tsx:48](src/components/refinement-session/SessionEndModal.tsx#L48) → `useTicketsByKeys(session.ticketKeys)`
   - [SessionWrapUpCelebration.tsx:132](src/components/refinement-session/SessionWrapUpCelebration.tsx#L132) → `useTicketsByKeys(queue)`
   - [refinement/[sessionId]/session/[ticketKey]/page.tsx:87](src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx#L87) → `useTicketsByKeys(session.ticketKeys)`
5. **[useTicketHoverData.ts:45](src/hooks/useTicketHoverData.ts#L45)** — highest-impact `__all__`. Convert to lazy per-key resolution if a consumer audit shows no caller relies on the eager full-list for synchronous first paint; otherwise defer to a follow-up. (Decide during implementation.)
6. **`docs/architecture/client-data-and-memory.md` (NEW)** + links in [docs/index.md](docs/index.md) and [CLAUDE.md](CLAUDE.md). Documents the cap contract, why eviction is safe, the list-vs-detail payload split (checkbox 7 invariant), the no-`__all__` rule, and the virtualization rule. (Checkbox 8)

### Deferred to follow-up stories (oversized / regression-prone)

- **BRDG-388** — Refinement queue server-side search/scoping ([RefinementPageContent.tsx:114](src/components/refinement-session/RefinementPageContent.tsx#L114)): a genuine whole-pool free-text browse; needs a new server search endpoint, not `useTicketsByKeys`. Closes the last part of checkbox 4.
- **BRDG-389** — Virtualize the grouped Sprint Board (checkbox 5): blocked by "multiple tbodies vs uniform virtual indices" and entangled with DnD/collapse/pinning in a 998-line component.
- **BRDG-390** — Virtualize remaining lists (checkbox 6): Inbox/Cleanup are low-risk drop-ins; `RefinementTicketList` conflicts with its FLIP reorder animation and needs care.

> Checkbox 4 closes for 5 of 6 sites here; site 6 is tracked in BRDG-388. Checkboxes 5/6 move to BRDG-389/390. The LRU (steps 1-3) is the global memory bound and is independently the highest-value, lowest-risk slice.

## Acceptance Criteria

- [x] The global SWR cache is bounded by an access-order LRU; entry count never exceeds the cap during a long session.
- [x] Optimistic board edits and sprint moves still survive a stale refetch **and** survive an SWR cache eviction of the underlying list key (test-proven).
- [x] Navigating across many sprints/tickets for an extended period does not grow tab memory without bound (cache size stabilises at the cap).
- [ ] No view uses `useTickets("__all__")`; the 6 listed sites fetch only scoped data.
- [ ] The grouped Sprint Board renders only visible rows (virtualized); large grouped boards no longer mount every row.
- [ ] The Refinement queue and Inbox/Cleanup lists are virtualized.
- [ ] List payloads carry summaries only; full ADF/comments load on detail open.
- [ ] `docs/architecture/client-data-and-memory.md` exists and is linked from `docs/index.md` and `CLAUDE.md`.

## Technical Notes

- Primary files: [SWRProvider.tsx](src/components/SWRProvider.tsx), new `src/lib/swr-lru-provider.ts`, the 6 `useTickets("__all__")` sites, [TicketTable.tsx](src/components/sprint-board/TicketTable.tsx) (grouped path), [RefinementTicketList.tsx](src/components/refinement-session/RefinementTicketList.tsx).
- Do **not** move pending-edit/move state into the cache; it must stay in the external stores ([pendingTicketEdits.ts](src/components/sprint-board/pendingTicketEdits.ts), [pendingSprintMoves.ts](src/components/sprint-board/pendingSprintMoves.ts)).
- The cross-tab sync bridge ([TicketSyncBridge.tsx](src/components/TicketSyncBridge.tsx)) patches the cache with `{ revalidate: false }`; an evicted target re-derives from the server on next read (`editState` is server-persisted), so no special-casing is needed.
- No `useSWRInfinite` exists, so the LRU needs no page-group handling.

## Out of Scope

- The backend response cache ([lib/cache.ts](src/lib/cache.ts)) — already bounded.
- The SSE event-bus transport itself — it does not buffer history and is not a leak.
- Migrating `MultiSprintView` to the overlay (tracked separately in [optimistic-updates.md](docs/architecture/optimistic-updates.md) "Known follow-up").
- Non-data memory (extensions, browser internals).

## Dependencies

- Existing: SWR, the optimistic overlay ([optimistic-updates.md](docs/architecture/optimistic-updates.md)), `@tanstack/react-virtual` (already used by the flat board).

## Testing

- Co-locate tests next to changed files.
- Cover:
  - LRU provider: respects cap, evicts least-recently-used, keeps most-recently-used, touch-on-read updates order.
  - Pending overlay survives an eviction + refetch of the list key (the Part 1 safety guarantee).
  - Rule A sites: assert they no longer request the full backlog (scoped key / param).
  - Grouped Sprint Board: only visible rows are mounted for a large grouped dataset.
  - Refinement/Inbox lists: virtualized rendering.
