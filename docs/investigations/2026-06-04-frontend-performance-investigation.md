# Frontend Performance Investigation

Date: 2026-06-04
Goal: Make the app feel faster — opening stories, switching pages, refreshes. "Loading takes just a bit too long."

## Method

- Four parallel code explorations: ticket-open flow, sprint-board + navigation, server-side fetching, client bundle weight.
- Live timing against the running dev server (port 3100, Turbopack) with the dev-bypass cookie.
- A full production build (`.next-build`) for real route bundle sizes, plus a production server on port 3200 to compare the per-request floor.

## Headline finding: most of the felt slowness is dev-mode overhead

Measured, warm (repeated) request cost, server-side TTFB:

| Path | Dev (Turbopack) | Production |
|------|-----------------|------------|
| Static asset (favicon, skips middleware) | ~1.5 ms | n/a |
| Any API route (cached, behind middleware) | **~250 ms flat** | ~2-3 ms to reject (auth path) |
| Page HTML, first visit in session | **1.0-3.4 s** | precompiled (no per-route compile) |
| Page HTML, warm | ~250-420 ms | precompiled |

Two decisive observations:

1. **Every request behind the middleware matcher sits at a flat ~250 ms in dev, regardless of payload** (a 75-byte dev-info response and a 49 KB epics-progress response took the same ~250 ms; TTFB == total, so it is server-side, not transfer). The data layer is not the bottleneck — SQLite reads are sub-millisecond and already cached.
2. **In production the same middleware path rejects in ~2-3 ms.** So the ~250 ms floor is Turbopack/dev instrumentation per request, not Clerk auth or DB work. And the 1-3.4 s first-visit cost is Turbopack on-demand compilation, which does not exist in a production build.

Implication: if the app is used in `npm run dev` for daily work, the dominant pain (slow first navigation to each view, ~250 ms tax on everything) is a dev artifact that a production build largely removes. This must be confirmed before optimizing further.

## Production-relevant findings (these matter even with a prod build)

### 1. Heavy First Load JS on the most-used pages (HIGH)

From the production build (shared baseline = 103 KB):

| Route | First Load JS | Page chunk |
|-------|---------------|-----------|
| `/sprint-board/[[...slug]]` | **586 KB** | 31.4 KB |
| `/sprint-board/compare` | 567 KB | 12.5 KB |
| `/tickets/[key]` | **557 KB** | 7.18 KB |
| `/refinement/[sessionId]/session/[ticketKey]` | 496 KB | 20.5 KB |
| `/tickets/[key]/write` | 461 KB | 52.6 KB |
| Most other routes | 104-220 KB | small |

The two highest-traffic pages (sprint board, ticket detail) ship ~550-590 KB. That JS has to download, parse, and hydrate before the page is interactive — this is what makes "opening a story" feel heavy even when the data is already there.

Main contributors (all eager static imports):
- **TipTap editor loaded on ticket detail even in read-only view.** `EditableDescription.tsx:10` statically imports `RichEditor`; the editor only renders when `editing === true`, but the whole TipTap stack (`@tiptap/react`, `core`, `pm`, `starter-kit`, extensions) is in the bundle regardless. ~150-200 KB. `EditableDescription` is imported by `TicketTabContent.tsx:8`, which the ticket page loads at `tickets/[key]/page.tsx:31`.
- **PrismJS base loaded for read-only markdown.** `renderMarkdown.tsx:35` imports `prismjs` eagerly; `renderMarkdown()` runs unconditionally in the read view (`EditableDescription.tsx:387`). ~50-70 KB. (Per-language grammars are already lazy — good.)
- **@dnd-kit on the sprint board** (`SprintBoard.tsx:39`), ~40-50 KB. `optimizePackageImports` is configured so tree-shaking should help, but the core is still on the critical path.

`lucide-react` icons, command palette + fuse.js, chat's react-markdown, and the modals are already correctly individual-imported or `next/dynamic`-loaded. No action needed there.

### 2. On-demand Jira fetch blocks the response on a cache miss (HIGH, opening stories)

`src/lib/ticket-detail-builder.ts:284-295`: if a ticket is not in the local SQLite cache, the GET handler calls `jiraClient.getIssue(key)` synchronously, then re-runs all queries. That is a 500 ms-2 s blocking network round-trip to Jira on the first open of any uncached/stale ticket. The page does render a skeleton (`tickets/[key]/loading.tsx` + client SWR), so it is not a blank screen, but the content takes that long to appear.

Secondary: `resolveEpicChildren()` (`ticket-detail-builder.ts:302-304`) runs after the 13 parallel base queries rather than alongside them — adds ~100-150 ms for epics with many children. The base queries themselves are already parallel (`Promise.all`) and the epic-children sub-queries are already batched with `inArray`. So the only structural win here is overlapping the two phases.

### 3. dev-info pulls 15-20 Bitbucket calls in the request path (MEDIUM)

`src/app/api/tickets/[key]/dev-info/route.ts` -> `bitbucket-client.ts:253+` makes sequential Bitbucket REST calls (branches + PRs per repo, then diffstat + build statuses per PR, then pipeline steps for merged PRs). Cached 120 s, but a cold ticket with several PRs can wait seconds. This loads on the ticket detail "Development" tab.

### 4. Missing `loading.tsx` on ~14 routes (MEDIUM, page switching)

Only 6 routes have a `loading.tsx` (sprint-board, epics, chat, story-writer, refinement, tickets/[key]). Missing on: activity-log, chat/[id], pipelines, refinement/[sessionId] (+nested), refinement/history, all 8 settings sub-routes, sprint-board/compare, sprint-board/diff-preview, stakeholder, test-center, tickets/[key]/write. Without it the user sees the previous page frozen (or blank) until the new page's JS resolves. The sidebar already uses `<Link prefetch>` (`Sidebar.tsx:119-134`), which is good.

### 5. No `keepPreviousData` anywhere (MEDIUM, perceived speed)

No SWR hook uses `keepPreviousData`. Navigating away and back to a page (e.g. sprint board -> ticket -> back) shows a loading state instead of the previously rendered data while it revalidates. Adding it makes back-navigation feel instant.

### 6. Global cache invalidation churn (MEDIUM, refreshes)

`ActivityContext.tsx` polls `/api/activity-log` every 5 s (busy) / 30 s (idle) and, on each scheduler tick (`useSchedulerTick`, 30 s) and incremental sync, calls `globalMutate(/api/tickets*)` — invalidating every ticket cache app-wide. This forces all mounted ticket lists/detail to refetch and re-render on a timer, which reads as periodic "stutter." Related to the known Turbopack `cache.invalidate` unreliability already noted in project memory. `useTickets` also runs a `refreshInterval: 60000` on top of this.

### 7. Server N+1 in sync routes (LOW for FE feel)

`sync-epics`, `sync-tickets` (per-key), `sync-comments`, `sync-links` all `await` inside a `for` loop (e.g. `sync-comments/route.ts:48-77` does a findFirst + insert/update per comment). For 100 epics that is 600-800 sequential queries. These are background/sync operations, so they affect data freshness latency more than the interactive FE, but they can saturate the single SQLite writer and indirectly slow concurrent reads. Lower priority for the stated goal.

## Prioritized recommendations (no code written yet)

If used in **production**:
1. Lazy-load `RichEditor` (TipTap) until the user actually edits a description; defer/lazy Prism. Biggest single bundle win on the two hottest pages (~200-270 KB off `/tickets/[key]`).
2. Add `keepPreviousData` to the main list/detail SWR hooks for instant back-navigation.
3. Add `loading.tsx` skeletons to the ~14 routes missing them.
4. Make the on-demand Jira fetch non-blocking (return cached/skeleton immediately, sync in background) or pre-warm on hover/prefetch.
5. Tame the 30 s app-wide `globalMutate(/api/tickets*)` churn (scope invalidation to the affected ticket/sprint).

If used mainly in **dev mode**:
0. The single biggest improvement is running a production build for daily use, or accepting that Turbopack dev compilation is the cost. The ~250 ms floor and 1-3 s first-visit compiles do not exist in prod. Optimize 1-5 above only after switching, or they will be masked by dev overhead.

## Notes / unmeasured

- Authenticated production response times could not be measured (dev-bypass is disabled when `NODE_ENV=production`, and no Clerk session was available). Conclusions about prod API latency are structural (middleware ~2-3 ms + sub-ms SQLite + the documented Jira/Bitbucket cache-miss calls), not directly timed.
- All timings are local single-user; real Jira/Bitbucket latency depends on network.
