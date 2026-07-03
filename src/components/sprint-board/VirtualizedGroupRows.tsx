"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Ticket } from "@/types/ticket";
import type { TicketGroup } from "@/components/sprint-board/useGroupBy";

// BRDG-452: the grouped All view windows the rows INSIDE each expanded group card (one
// virtualizer per group) instead of flattening groups into a single list. Group cards,
// headers, composers, placeholders and zones stay real DOM, so the card chrome needs no
// reconstruction; only the row <tbody> is windowed, reusing the flat path's proven
// spacer-row + measureElement + scrollMargin pattern (BRDG-347/416).

// Windowing activates only past this TOTAL expanded-row count across all groups: small
// boards render plainly, avoiding per-group virtualizer overhead for the common case.
export const GROUPED_VIRTUALIZE_THRESHOLD = 100;

// SprintBoard derives the droppable measuring strategy from the same signal: while the
// grouped view is windowed, rows mount/unmount under mid-drag auto-scroll and must be
// re-measured (MeasuringStrategy.Always, the BRDG-347 lesson). The gate deliberately uses
// the RAW per-group ticket counts (not per-group filter narrowing, which is TicketTable
// state) so both components always agree.
export function isGroupedVirtualizationActive(
  groups: TicketGroup[],
  collapsedGroups: Set<string> | undefined,
): boolean {
  let total = 0;
  for (const g of groups) {
    if (collapsedGroups?.has(g.key)) continue;
    total += g.tickets.length;
    if (total > GROUPED_VIRTUALIZE_THRESHOLD) return true;
  }
  return false;
}

// Only rows and the "Finished work" divider live inside the window (the divider sits
// between rows, so it must be a measured item of its own). The composer, placeholders and
// the empty-group drop zone render as real DOM outside the windowed tbody, where they
// already live today.
export type GroupRowItem =
  | { kind: "row"; ticket: Ticket; groupIdx: number }
  | { kind: "divider" };

// Same pre-measurement estimate as the flat path; real heights come from measureElement.
const ROW_HEIGHT_ESTIMATE = 44;
const VIRTUALIZER_OVERSCAN = 20;
// Pre-mount margin around the viewport before a group's rows are considered visible.
const VIEWPORT_SLACK = 400;

// Marker attribute for the element wrapping ALL group cards. Each group's scrollMargin
// must re-measure when ANY group above it changes height (estimate -> measured rows), and
// that shift resizes neither the group itself nor the scroller — only this shared wrapper.
export const GROUPS_ROOT_ATTR = "data-board-groups-root";

export function VirtualizedGroupRows({
  items,
  scrollContainerRef,
  renderItem,
}: {
  items: GroupRowItem[];
  /** The board's shared scroll container (SprintBoard's contentScrollRef). */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  renderItem: (
    item: GroupRowItem,
    index: number,
    measureRef: (el: HTMLElement | null) => void,
  ) => ReactNode;
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  // THE PROD-ONLY DEADLOCK (diagnosed live on the prod build, BRDG-452): on first mount a
  // descendant's layout effects run BEFORE an ancestor's ref attaches, so at that moment
  // `scrollContainerRef.current` is still null. tanstack's _willUpdate silently skips
  // attaching its scroll/rect observers when getScrollElement() returns null, and it only
  // ever retries on a LATER render — if nothing re-renders the component, the virtualizer
  // stays permanently dead (scrollElement null, offset frozen, spacer-only output). Dev
  // masks this: StrictMode re-runs effects after refs have attached. The fix: resolve the
  // scroll element into STATE in a passive effect (refs are guaranteed attached by then),
  // which also guarantees the re-render tanstack needs to attach. Same-value setState is a
  // no-op, so the every-render effect does not loop.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setScrollEl((prev) => (prev === scrollContainerRef.current ? prev : scrollContainerRef.current));
  }, [scrollContainerRef]);

  // BRDG-416 pattern: the virtualizer's scrollMargin is this group's row-body offset
  // within the shared scroll container. Render-time reads see 0 on first paint, so measure
  // in a layout effect and re-measure when the scroller or the group stack changes size.
  // Rect deltas (not offsetTop) because a tbody's offsetParent is its table, not the
  // scroll container. The group stack is resolved via closest(GROUPS_ROOT_ATTR) — the DOM
  // ancestor is committed even while ref props are not attached yet.
  const [scrollMargin, setScrollMargin] = useState(0);
  const itemCount = items.length;
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !scrollEl) return;
    const measure = () => {
      const next = Math.max(0, Math.round(
        el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop,
      ));
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    const groupsRoot = el.closest(`[${GROUPS_ROOT_ATTR}]`);
    if (groupsRoot) ro.observe(groupsRoot);
    // Self-heal on scroll (rAF-throttled): a group's offset must be right exactly when the
    // user scrolls it into view; layout can shift between a group's mount and later
    // settles (estimate -> measured heights above it, group reorders) without any observed
    // resize. Two rect reads per group per frame; the guarded setState only renders on a
    // real change.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; measure(); });
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      scrollEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // itemCount: a per-group filter or data refresh changes this group's (and the ones
    // below it) offsets without any scroll or observed resize.
  }, [scrollEl, itemCount]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    // A virtualizer (re)attaching to its scroll element scrolls it to getScrollOffset();
    // the default initialOffset of 0 would yank the shared board scroller to the top on
    // every late attach or remount. Starting from the element's live position makes that
    // a no-op AND gives fresh instances a correct offset immediately.
    initialOffset: () => scrollEl?.scrollTop ?? 0,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: VIRTUALIZER_OVERSCAN,
    measureElement: (el) => el.getBoundingClientRect().height,
    scrollMargin,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // virtual-core's calculateRange CLAMPS an out-of-view range to the nearest edge index
  // instead of returning an empty range, so every off-screen group would still mount
  // ~overscan rows — hundreds of rows across a 46-group board, defeating the windowing.
  // Item start/end include scrollMargin, so real viewport overlap is a direct comparison.
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;
  const overlapsViewport =
    virtualRows.length > 0 &&
    virtualRows[0].start < scrollOffset + viewportHeight + VIEWPORT_SLACK &&
    virtualRows[virtualRows.length - 1].end > scrollOffset - VIEWPORT_SLACK;

  if (!overlapsViewport) {
    return (
      <tbody ref={bodyRef}>
        {totalSize > 0 && (
          <tr><td style={{ height: totalSize, padding: 0, border: "none" }} /></tr>
        )}
      </tbody>
    );
  }

  const paddingTop = virtualRows[0].start - scrollMargin;
  const paddingBottom = totalSize - (virtualRows[virtualRows.length - 1].end - scrollMargin);

  return (
    <tbody ref={bodyRef}>
      {paddingTop > 0 && (
        <tr><td style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
      )}
      {virtualRows.map((virtualRow) =>
        renderItem(items[virtualRow.index], virtualRow.index, virtualizer.measureElement),
      )}
      {paddingBottom > 0 && (
        <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
      )}
    </tbody>
  );
}
