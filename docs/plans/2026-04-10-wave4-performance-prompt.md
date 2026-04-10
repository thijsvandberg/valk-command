# Wave 4: Make It Faster - Implementation Prompt

Copy the prompt below into a clean Claude Code session.

---

## Prompt

```
Implement the Performance wave for this project (valk-command / Bridge). This covers 5 user stories that improve responsiveness and scalability. Read CLAUDE.md and the user stories before starting.

## Stories (implement in this order)

1. **BRDG-059: Database Query Optimization** - `docs/user-stories/BRDG-059-db-optimization.md`
   Start here because faster queries benefit everything else.

   Current state (already done, do not redo):
   - WAL mode is ON (`src/db/index.ts` line ~18: `sqlite.pragma("journal_mode = WAL")`)
   - Foreign keys are ON
   - Drizzle ORM parameterizes all queries (no SQL injection risk)
   - 2 raw SQL usages exist (both proper parameterized EXISTS subqueries in `/api/conversations/route.ts` and `/api/story-writer/active-sessions/route.ts`)

   What needs to be done:
   - **Add missing indexes** in `src/db/schema.ts` + create Drizzle migration:
     - `ticket`: add indexes on `status`, `assignee`, `type`, `epicKey` (only `sprintName` is indexed today)
     - `ticket`: add composite index `(sprintName, status)` for Sprint Board queries
     - `activityLog`: add index on `type` (only `startedAt` is indexed today)
     - `workspaceTask`: add indexes on `status`, `conversationId` (zero indexes today)
   - **Fix N+1 in `/api/story-writer/active-sessions/route.ts`**: currently loads ALL tickets into memory (full `db.select().from(ticket).all()`) just to map session ticket keys. Replace with a JOIN query.
   - **Optimize `/api/jira/sync-tickets/route.ts`** (around line 65-93): loop does individual `db.query.ticket.findFirst()` per key. Batch-fetch all existing tickets with `inArray()` first, then update in a transaction.
   - **Add `PRAGMA optimize`** call on app startup in `src/db/index.ts`
   - **Add query timing utility**: wrapper function in `src/lib/query-timer.ts` that logs queries exceeding 100ms to console. Add `X-Query-Time-Ms` response header to the heaviest endpoints (`/api/tickets`, `/api/tickets/[key]`).

2. **BRDG-055: API Response Caching Layer** - `docs/user-stories/BRDG-055-api-caching.md`

   Current state:
   - No server-side caching exists (except `Cache-Control: private, max-age=3600` on `/api/attachments/[id]`)
   - Client-side: SWR with 30s deduping handles most repeat requests
   - Single-process Next.js, so in-memory cache is fine

   What needs to be done:
   - **Create `src/lib/cache.ts`**: in-memory Map-based cache with TTL and LRU eviction (max 200 entries)
   - API: `cache.get(key)`, `cache.set(key, value, ttlMs)`, `cache.invalidate(pattern)`, `cache.flush()`, `cache.stats()`
   - **Apply to these endpoints** (wrap response with cache check):
     - `GET /api/tickets` (TTL: 30s) - key includes query params (sprintId)
     - `GET /api/tickets/[key]` (TTL: 60s)
     - `GET /api/jira/sprints` (TTL: 5 min)
     - `GET /api/tickets/[key]/dev-info` (TTL: 2 min)
   - **Smart invalidation**: invalidate ticket caches after Jira sync completes (in sync-tickets, sync-incremental, sync-sprints routes). Invalidate specific ticket on metadata PUT.
   - **Add Cache-Control headers**: `private, max-age=10, stale-while-revalidate=20` on cached endpoints
   - **Stats endpoint**: `GET /api/cache/stats` returning hit/miss counts and entry count
   - **Flush endpoint**: `POST /api/cache/flush`

3. **BRDG-056: Optimistic UI Updates** - `docs/user-stories/BRDG-056-optimistic-ui.md`

   Current state (already has some optimistic patterns):
   - `useTicketReviews`: has optimistic save/delete via `globalMutate()` with key predicates
   - `useMessages`: has optimistic message insertion + rollback
   - `useJobs`: has optimistic update/delete + rollback
   - `useConversations`: has optimistic delete
   - `useStoryWriterDrafts`: debounced local-first saves

   What's MISSING (focus here):
   - **Sprint Board metadata updates**: `useSprintBoard.ts` has NO optimistic mutations for PO status, quality score, or notes changes. These go through the side panel and wait for API response before updating.
   - Add optimistic mutation for `PUT /api/tickets/[key]/metadata` that instantly updates the SWR cache for both the ticket list (`/api/tickets?sprintId=X`) and ticket detail (`/api/tickets/[key]`)
   - Add optimistic mutation for bulk PO status changes (the bulk action bar in Sprint Board)
   - Add error toast with "Retry" button on revert (use a simple toast, not a new toast system)
   - Add subtle loading indicator (opacity change or spinner) on cells with in-flight mutations
   - **No global SWR config exists**: consider adding `<SWRConfig>` in `src/app/(app)/layout.tsx` with shared fetcher and error handler

4. **BRDG-058: Prefetch Adjacent Views** - `docs/user-stories/BRDG-058-prefetch.md`

   Current state:
   - ZERO prefetching exists. All data loads on demand.
   - Hover tracking exists on TicketRow (`onMouseEnter` sets hover state) but only for UI styling, not data loading.
   - SWR has `preload(key, fetcher)` available but unused.
   - Next.js `<Link>` prefetch is default behavior for static pages but not configured for dynamic routes.

   What needs to be done:
   - **Hover prefetch on Sprint Board rows**: When hovering a ticket row for 200ms+, call `SWR preload` for `/api/tickets/${key}` to warm the cache. This makes side panel opening instant. Add to `TicketRow.tsx` `onMouseEnter` handler with a debounced timer (cancel on `onMouseLeave`).
   - **Adjacent sprint prefetch**: When Sprint Board loads, also preload tickets for the previous and next sprint slot. Use `SWR preload` with low priority.
   - **Prefetch on SidePanel ticket detail**: When viewing a ticket in SidePanel, preload the next and previous ticket in the filtered list.
   - **Connection-aware**: Check `navigator.connection?.effectiveType` and skip prefetch on slow connections (2g, slow-2g). Limit concurrent prefetches to 3.
   - **Shared fetcher**: Use the same fetcher function from the SWR config (from BRDG-056) for preload calls.

5. **BRDG-057: Virtual Scrolling** - `docs/user-stories/BRDG-057-virtual-scrolling.md`

   Current state (ALREADY PARTIALLY IMPLEMENTED):
   - `@tanstack/react-virtual` is imported and used in `src/components/sprint-board/TicketTable.tsx`
   - Virtualization activates at threshold of 200 tickets (`VIRTUALIZE_THRESHOLD = 200`)
   - Config: estimated row height 40px, overscan 20 rows, `measureElement` enabled
   - Below 200 tickets: full DOM rendering with dnd-kit SortableContext

   What needs to be done (refinement, not rewrite):
   - **Lower the threshold** from 200 to 80. Most sprints have 30-60 tickets, so this won't trigger often, but larger planning views and multi-sprint views benefit. Test that dnd-kit drag-and-drop still works when virtualization is active below 200 rows.
   - **Improve scroll stability**: The current `estimateSize: () => 40` may cause scroll jumps when rows have different heights (long titles, expanded notes). Verify `measureElement` is working correctly by testing with tickets that have varying title lengths.
   - **Ensure filter/sort resets scroll**: When filters or sort change, the virtualizer should reset scroll position to top. Check if this already happens; if not, call `virtualizer.scrollToIndex(0)` on filter/sort changes.
   - **Performance test**: Manually test with 100+ tickets loaded and verify 60fps scrolling in Chrome DevTools Performance panel. Document the results.

## Key codebase context

- Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, SQLite + Drizzle ORM, SWR
- Dev server: `npm run dev` on port 3100
- All SWR hooks are in `src/hooks/useSprintBoard.ts` (14 hooks, lines 1-246)
- Non-SWR hooks: `src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`, `src/hooks/useJobs.ts`
- Sprint Board components: `src/components/sprint-board/SprintBoard.tsx`, `TicketTable.tsx`, `TicketRow.tsx`, `SidePanel.tsx`
- DB schema: `src/db/schema.ts`, DB init: `src/db/index.ts`
- Activity context with SWR polling: `src/contexts/ActivityContext.tsx`
- Global fetcher (not shared yet): `const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null))` in useSprintBoard.ts line 7
- API routes: ~39+ routes under `src/app/api/`
- Sync routes that should invalidate cache: `src/app/api/jira/sync-tickets/route.ts`, `src/app/api/jira/sync-incremental/route.ts`, `src/app/api/jira/sync-sprints/route.ts`
- Metadata update: `src/app/api/tickets/[key]/metadata/route.ts`
- Tests: run `npx vitest run` (foreground, no pipes, one at a time)
- Checks before commit: `npm run lint && npm run typecheck && npm run test && npm run build`

## Rules

- Implement story by story, in order. Mark each checkbox in the story file as done when complete.
- Run tests after each story. Fix any regressions before moving to the next.
- Add tests for new code (cache module, rate limiter, query timer, prefetch hooks).
- Do not change existing features or UI beyond what's needed for performance.
- Do not introduce new dependencies unless specified (e.g., no Redis, no chart libraries).
- Commit after each completed story with a conventional commit message.
```
