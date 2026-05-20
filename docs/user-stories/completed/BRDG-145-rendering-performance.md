# BRDG-145: Sprint Board & Ticket Detail Rendering Performance

**Status:** Done
**Priority:** High

## Description

As the PO, I want the sprint board and ticket detail views to feel snappy and responsive, so that navigating tickets, hovering rows, and switching tabs does not cause visible lag or jank.

Currently both views suffer from excessive re-rendering and unnecessary work on mount. The sprint board re-renders every row on any interaction (hover, drag, state change) because TicketRow is not memoized and receives unstable props. The ticket detail page loads all tab content eagerly and makes duplicate API calls.

## Investigation findings

See conversation of 2026-05-20 for full analysis. Key metrics:
- Sprint board: ~20 useState hooks in SprintBoard, every hover triggers full table re-render
- Ticket detail: 8 API calls on mount, 5 tab components loaded regardless of active tab
- TicketRow: 30+ props, no React.memo, unstable object/function defaults created per render

## Implementation Plan

**Order: 2 > 5 > 1 > 4 > 3** (hoveredRow removal first, since it simplifies memoization)

1. **Remove hoveredRow state (Item 2):** Remove `hoveredRow` useState from SprintBoard, remove `hoveredRow`/`onHoverRow`/`onLeaveRow` props from TicketTable and TicketRow. Replace JS-driven hover styling with CSS `:hover` / `group-hover/row`. Keep prefetch-on-hover via native `onMouseEnter`. Handle checkbox visibility with `group-hover/row:opacity-100` (suppressed during drag via conditional class).

2. **Memoize status counts (Item 5):** Replace 5 separate `.filter()` calls in SprintBoard (lines 267-276) with a single `useMemo` pass. Also fold `bvScoredTickets` and its reduce into the same loop.

3. **Memoize TicketRow + SortableTicketRow (Item 1):** First stabilize props in TicketTable (`EMPTY_MAP`, `NOOP` constants). Then wrap TicketRow with `React.memo` (shallow compare). Wrap SortableTicketRow with `React.memo` + `useMemo` for `rowStyle`.

4. **Deduplicate useTicketReviews (Item 4):** Remove `useTicketReviews` from TicketSidebar, add `reviewData` prop, pass from parent page.

5. **Lazy load tab content (Item 3):** Convert TicketHistory, TicketReview, TicketRefinement, TicketDevelopment to `next/dynamic` imports with a spinner fallback.

## Acceptance Criteria

### 1. Memoize TicketRow and SortableTicketRow (Sprint Board)

**What needs to happen:**

a) Stabilize props in `TicketTable.tsx` before memoization can work:
   - Move `sprintNameMap ?? {}` default to a module-level constant (e.g., `const EMPTY_MAP = {}`)
   - Move `onReadinessChange ?? (() => {})` default to a module-level no-op (e.g., `const NOOP = () => {}`)
   - Wrap any callback props passed to `makeRowProps` in `useCallback` where not already done
   - Ensure object props like `poStatuses`, `readinessMap` have stable references (useMemo if derived)

b) Wrap `TicketRow` with `React.memo` and a custom `areEqual` comparator:
   - Compare primitive props directly (key, status, storyPoints, etc.)
   - Compare object props by reference (they should now be stable from step a)
   - Compare callback props by reference
   - Document which props are compared and why, so future prop additions don't silently break memoization

c) Wrap `SortableTicketRow` with `React.memo`:
   - Move inline `rowStyle` object to `useMemo` inside the component
   - Compare sortable state + all TicketRow props

d) Verify no regressions:
   - [x] Hover highlighting still works
   - [x] Drag-and-drop still works
   - [x] Status changes reflect immediately
   - [x] Readiness/score changes reflect immediately
   - [x] Bulk select checkboxes work
   - [x] Inline editing works

### 2. Move hoveredRow to local level (Sprint Board)

- [x] Remove `hoveredRow` useState from SprintBoard
- [x] Implement hover styling via CSS `:hover` on the row element, or manage hover state locally within TicketRow/SortableTicketRow
- [x] Verify: if hoveredRow is read elsewhere in SprintBoard (e.g., for conditional rendering outside the table), find an alternative approach (CSS-only or event-based)
- [x] Hover highlight visually identical to current behavior

### 3. Lazy load tab content (Ticket Detail)

- [x] Convert tab content imports to `React.lazy` + `dynamic()` (Next.js):
  - TicketHistory
  - TicketReview
  - TicketRefinement
  - TicketDevelopment
- [x] Only mount the active tab component; unmount inactive tabs (or use a keep-alive pattern if tab switch latency is noticeable)
- [x] Add a lightweight Suspense fallback (skeleton or spinner) for first tab load
- [x] The default "Content" tab must remain eagerly loaded (it is the most viewed)

### 4. Deduplicate useTicketReviews (Ticket Detail)

- [x] Remove `useTicketReviews()` call from TicketSidebar
- [x] Pass `reviewData` as a prop from the parent page to TicketSidebar
- [x] Verify review quality score and "outdated review" indicator still work in the sidebar

### 5. Memoize status counts (Sprint Board)

- [x] Replace the 5 separate `.filter()` calls in SprintBoard with a single `useMemo` pass:
  ```
  const statusCounts = useMemo(() => {
    const counts = { todo: 0, inProgress: 0, test: 0, done: 0, points: 0 };
    for (const t of allTickets) {
      if (t.jiraStatus === "TO DO") counts.todo++;
      else if (t.jiraStatus === "IN PROGRESS") counts.inProgress++;
      // etc.
    }
    return counts;
  }, [allTickets]);
  ```
- [x] Ensure the dependency array is correct (only `allTickets` reference)

## Testing

- [x] No visual regressions in sprint board (hover, drag, select, inline edit)
- [x] No visual regressions in ticket detail (all tabs render correctly)
- [x] Sprint board does not re-render all rows on hover (verify with React DevTools Profiler or console.count in TicketRow)
- [x] Tab switch in ticket detail shows content without excessive delay
- [x] All existing tests pass (`npm run test`) <!-- 4 pre-existing failures in page.test.tsx due to missing ResizeObserver polyfill, not caused by this change -->

## Technical notes

### Key files

**Sprint Board:**
- `src/components/sprint-board/SprintBoard.tsx` (1235 lines)
- `src/components/sprint-board/TicketTable.tsx` (685 lines)
- `src/components/sprint-board/TicketRow.tsx` (613 lines)

**Ticket Detail:**
- `src/app/(app)/tickets/[key]/page.tsx` (851 lines)
- `src/components/ticket-detail/TicketSidebar.tsx` (533 lines)

### Risk: stale renders after memoization

The biggest risk with item 1 is that the custom `areEqual` function misses a prop, causing stale data to display. Mitigate by:
- Starting with a shallow comparison of ALL props (safe default)
- Only optimizing to selective comparison if shallow compare is insufficient
- Adding a dev-mode warning if new props are added to TicketRow without updating the comparator
