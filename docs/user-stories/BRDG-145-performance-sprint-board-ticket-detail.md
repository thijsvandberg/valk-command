# BRDG-145: Performance Optimization Sprint Board & Ticket Detail

**Status:** Open
**Priority:** High

## Description

As the PO, I want the sprint board and ticket detail views to be significantly faster and more responsive so that navigating large sprints (100+ tickets), filtering, and opening ticket details feels instant.

## Problem

Performance auditing identified 20+ optimization opportunities across the sprint board and ticket detail views. Key issues: broad SWR cache invalidation causing unnecessary re-fetches, per-row hook calls scaling linearly with ticket count, over-fetching of ticket detail data, heavy markdown rendering without caching, and missing memoization causing cascading re-renders.

## Implementation Plan

1. **Quick wins** (Phase 1 one-liners): SWR intervals (#3), image lazy-loading (#4), unoptimized removal (#5), virtualization threshold (#6), passive scroll (#21 - already done), defer prefetch (#22)
2. **Targeted mutations** (#1): Refactor `sprint-board-utils.ts` `globalMutate` to accept active sprint key. Update `useTicketReviews` mutations in `useSprintBoard.ts`.
3. **Hook hoisting** (#2): Move `useFollowedTickets`, `useLastDeployed`, `useFollowTicket`, `usePipelineHealth` from `TicketRow` to `TicketTable`, pass as props.
4. **Filter memo split** (#7): Chain `useMemo` calls in `useSprintBoardFilters.ts` per filter type.
5. **renderMarkdown cache** (#10): Module-level LRU Map keyed on content string.
6. **React.memo wrappers** (#11): Wrap `GroupStatBar`, `PreviewPane`, `StatusBadge`, `SprintAnalytics`.
7. **ActivityProvider split** (#8): Two contexts with memoized values, backward-compat combined hook.
8. **Lazy-load detail sections** (#9): Fetch comments/attachments/linked issues per-tab.
9. **Dynamic imports** (#12, #13): `SearchModal`, `SprintListModal`, `DiffViewer`.
10. **next.config optimizePackageImports** (#14): Add `lucide-react`, `fuse.js`.
11. **Extract SprintBoard hooks** (#15): `useSprintStats`, `useSprintDragAndDrop`.
12. **SearchModal decomposition** (#16): Wrap result list in `React.memo`.
13. **CSS polish** (#17-#20): transition-all fix, keyframes to global CSS, code block grid, debounce onLocalEdit.

Notes: Item #21 already implemented. Duplicate `VIRTUALIZE_THRESHOLD` in `SprintBoard.tsx:512` must also be updated. `usePipelineHealth` should be hoisted alongside the other hooks in item 2.

## Acceptance Criteria

### Phase 1: Data fetching efficiency

- [x] Replace broad `globalMutate` pattern in `sprint-board-utils.ts` with targeted mutations that only invalidate the active sprint key instead of all ticket list endpoints
- [x] Hoist `useFollowedTickets()` and `useLastDeployed()` from `TicketRow` to `TicketTable` and pass data as props (eliminates 100x duplicate hook calls per board render)
- [x] Increase SWR `refreshInterval` for ticket list from 15s to 60s (adaptive: 30s when jobs are running) and `dedupingInterval` from 5s to 15s
- [x] Add `loading="lazy"` and dimension hints to `<img>` elements in `renderMarkdown.tsx`
- [x] Remove `unoptimized={true}` from `AttachmentsSection.tsx` to enable Next.js image optimization
- [x] Lower `VIRTUALIZE_THRESHOLD` in `TicketTable.tsx` from 80 to 40

### Phase 2: Memoization and re-render prevention

- [ ] Split `filteredTickets` useMemo (11 dependencies) in `useSprintBoardFilters.ts` into layered memos: status filter -> epic filter -> assignee filter -> search filter -> sort
- [ ] Split `ActivityProvider` context into `ActivityStatusContext` and `ActivityToastContext` with memoized context values to prevent full-tree re-renders
- [ ] Lazy-load ticket detail sections: fetch comments, attachments, and linked issues only when their respective tab is active (not in the main `/api/tickets/[key]` response)
- [ ] Memoize `renderMarkdown()` output using a content-hash cache (WeakMap or wrapper component with useMemo) to avoid re-parsing identical content
- [ ] Add `React.memo` to `GroupStatBar`, `PreviewPane`, `StatusBadge`, and `SprintAnalytics` components

### Phase 3: Code splitting and bundle optimization

- [ ] Dynamic import `SearchModal` and `SprintListModal` (only loaded when opened)
- [ ] Dynamic import `DiffViewer` in `TicketHistory` (only loaded when history tab is active)
- [ ] Add `optimizePackageImports` in `next.config.ts` for `lucide-react`, `fuse.js`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`
- [ ] Extract `SprintBoard.tsx` state into custom hooks: `useSprintStats()`, `useSprintDragAndDrop()` to reduce monolithic component re-renders
- [ ] Decompose `SearchModal` (19 useState calls) into memoized sub-components: `SearchFilterPanel`, `SearchResultList`, `SearchPreviewPane`

### Phase 4: CSS and rendering polish

- [ ] Replace `transition-all` with specific property transitions in `SprintBoard.tsx`
- [ ] Move inline `@keyframes fadeInUp` style block to global CSS (currently injected per render)
- [ ] Replace `<table>` layout for code blocks in `renderMarkdown.tsx` with CSS grid
- [ ] Debounce `onLocalEdit` callback in `EditableDescription.tsx` to prevent parent re-render on every keystroke
- [x] Add `{ passive: true }` to scroll event listener in `SprintSlots.tsx` <!-- already implemented -->
- [x] Defer ticket prefetching to mouse-enter intent instead of unconditional mount-time prefetch of first 5 tickets

## Technical Notes

- Phase 1 items are quick wins with the highest impact-to-effort ratio
- The broad `globalMutate` pattern in `sprint-board-utils.ts` is the single biggest performance bottleneck: updating one ticket currently re-fetches every visible sprint list
- Virtualization threshold change (80 -> 40) is a one-line change with immediate benefit for medium-sized sprints
- Splitting the ticket detail API requires new endpoints (e.g., `/api/tickets/[key]/comments`) and updating the corresponding SWR hooks
- `renderMarkdown` caching should use content string as key since the same Jira descriptions are rendered repeatedly across views
- ActivityProvider context split must preserve existing toast and activity log behavior

## Out of Scope

- Full rewrite of SprintBoard component architecture
- Replacing SWR with React Query or another library
- Server-side rendering changes
- Database query optimization (separate concern)
- Service worker or offline caching
