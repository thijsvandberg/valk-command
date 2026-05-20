# BRDG-146: Ticket Detail Page Load Speed

**Status:** Draft
**Priority:** High

## Description

As the PO, I want the ticket detail page to load near-instantly when opening in a new tab, so I can quickly review and update tickets during sprint planning and refinement.

Currently the ticket detail page makes 6 client-side API calls on mount, performs a background Jira freshness check (500ms-2s latency), and the `detail` object is recreated on every render. The main API route runs 10 sequential+parallel DB queries. While server-side caching (60s TTL) helps on repeat views, cold loads are noticeably slow.

## Investigation findings (2026-05-20)

### API calls on initial page load

| # | Hook | Endpoint | Dedup | Purpose |
|---|------|----------|-------|---------|
| 1 | `useTicketDetail` | `/api/tickets/[key]` | 30s | Main ticket data + detail (10-30 KB) |
| 2 | `useTicketReviews` | `/api/tickets/[key]/reviews` | 30s | Reviews list + version hash |
| 3 | `useTicketVersionCount` | `/api/tickets/[key]/versions?metaOnly=true` | 60s | Version count for History tab badge |
| 4 | `useActiveWriterSessions` | `/api/story-writer/active-sessions` | 30s | Active AI writer session check |
| 5 | `useFollowedTickets` | `/api/followed-tickets` | 30s | Followed tickets list |
| 6 | `useJiraSprints` | `/api/jira/sprints` | 30s | Sprint labels for sidebar |

Plus background: `jiraApi.checkUpdated(key)` calls Jira REST API (500ms-2s).

### Main API route: `/api/tickets/[key]` (route.ts)

- 1 initial DB query for base ticket
- 9 parallel DB queries via `Promise.all` (metadata, attachments, comments, subtasks, links, epic children, local edits, latest version, parent lookup)
- 1 sequential DB query for parent ticket title (N+1, only when ticket is a subtask)
- Server-side cache: 60s TTL, LRU 200 entries
- Response includes full `metadata` object (28+ fields) even though only a few are used

### Client-side rendering issues

- `detail` object (line 108 page.tsx) is NOT memoized, recreated on every render
- All child components receiving `detail` re-render when parent state changes
- `metadata` object returned from API but only a handful of fields used by the page

### Prism / renderMarkdown.tsx

- 18 Prism languages loaded synchronously at import time (~15-20 KB gzipped)
- Highlight runs synchronously per code block
- Only relevant when Content tab is active and description contains code

## Implementation Plan

**Order: 3 > 4 > 5 > 2 > 1 > 7 > 6** (low-risk items first, complex last)

1. **Memoize detail (AC #3):** Wrap `detail` in `useMemo([apiData])` in page.tsx. Zero risk.
2. **Trim metadata (AC #4):** Remove `metadata: meta ?? null` from API response body. Update tests.
3. **Defer Jira check (AC #5):** Add 3s `setTimeout` in `useTicketDetail` before `checkUpdated`. Clear on cleanup.
4. **Fix N+1 (AC #2):** Replace sequential parent lookup with a joined query (ticketSubtask + ticket) inside the existing `Promise.all`.
5. **Consolidate API calls (AC #1):** Add `reviewCount`, `versionCount`, `currentVersionHash` to main `/api/tickets/[key]` response. Remove `useTicketVersionCount` from page. Read counts from `apiData`.
6. **Prefetch hints (AC #7):** Add `router.prefetch('/tickets/${key}')` alongside `prefetchTicketDetail` in TicketRow hover handler.
7. **Lazy Prism (AC #6):** Replace 20 static Prism imports with dynamic loader. Fallback to unhighlighted on first render, re-render when loaded.

## Acceptance Criteria

### 1. Consolidate API calls on page load

The page currently makes 6 parallel API calls. Some can be folded into the main ticket response to reduce round-trips.

- [ ] Include `reviewCount` and `currentVersionHash` in the main `/api/tickets/[key]` response (avoids separate `/reviews` call just for the tab badge count)
- [ ] Include `versionCount` in the main response (avoids separate `/versions?metaOnly=true` call)
- [ ] This reduces initial API calls from 6 to 4

### 2. Fix N+1 parent ticket query

- [ ] When a ticket is a subtask, the parent ticket title is fetched in a sequential query after the main `Promise.all`. Move the parent ticket info into the initial query by joining or batching.
- [ ] Option A: Include the parent lookup as a subquery in the `Promise.all`, then resolve the title in-memory
- [ ] Option B: Use a join to fetch parent title alongside the subtask relationship query

### 3. Memoize `detail` object

- [x] Wrap the `detail` derivation (page.tsx line 108) in `useMemo([apiData])` to prevent unnecessary re-renders of child components (AttachmentsSection, SubtasksSection, CommentsSection, etc.)

### 4. Trim API response payload

- [ ] Remove the full `metadata` object from the `/api/tickets/[key]` response. The relevant metadata fields (readiness, poStatus, qualityScore, businessValue, poNotes) are already spread into the top-level response.
- [ ] This saves ~1-2 KB per response and avoids leaking internal metadata

### 5. Defer Jira freshness check

- [ ] The background `jiraApi.checkUpdated()` call fires immediately on mount, competing for bandwidth with the 6 SWR requests. Defer it by 2-3 seconds (e.g., `setTimeout`) so the primary data loads first.
- [ ] If the main ticket response includes a `Cache-Control` header with a recent `max-age`, skip the freshness check entirely for that window

### 6. Lazy-load Prism languages

- [ ] Instead of importing all 18 Prism languages at module level in `renderMarkdown.tsx`, detect which languages are actually present in the markdown content and load only those via dynamic `import()`
- [ ] Fallback: if a language is not loaded yet, show the code block without highlighting, then re-render once loaded
- [ ] This reduces the initial bundle by ~15-20 KB (gzipped)

### 7. Add prefetch hint from sprint board

- [ ] When hovering a ticket row in the sprint board, the prefetch already fires for `/api/tickets/[key]`. Verify this cache is shared with SWR so opening in a new tab benefits from it.
- [ ] Consider adding `<link rel="prefetch">` for the ticket page chunk when hovering, so the JS bundle is also pre-loaded

## Testing

- [ ] Ticket detail page loads with correct data (Content tab, sidebar, all sections)
- [ ] History tab badge shows correct version count
- [ ] Review tab badge shows correct review count
- [ ] Sidebar quality score and "outdated review" indicator still work
- [ ] Parent ticket link still works for subtasks
- [ ] Code blocks in descriptions still highlight correctly
- [ ] No regressions in ticket editing (title, description, push to Jira)
- [ ] All existing tests pass

## Technical notes

### Key files

- `src/app/api/tickets/[key]/route.ts` (GET handler, ~243 lines)
- `src/app/(app)/tickets/[key]/page.tsx` (client component, ~851 lines)
- `src/hooks/useSprintBoard.ts` (useTicketDetail hook, lines 58-92)
- `src/components/ticket-detail/renderMarkdown.tsx` (Prism + markdown, 745 lines)
- `src/app/api/jira/check-updated/route.ts` (Jira freshness check)

### Priority order

1. Memoize `detail` object (low effort, immediate win)
2. Consolidate API calls (medium effort, biggest perceived speed improvement)
3. Defer Jira freshness check (low effort, reduces bandwidth contention)
4. Trim API response (low effort, cleaner payloads)
5. Fix N+1 parent query (low effort, small latency win)
6. Lazy-load Prism (medium effort, bundle size win)
7. Prefetch hint from sprint board (low effort, nice-to-have)
