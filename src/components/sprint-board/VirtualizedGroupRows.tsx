"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

export function VirtualizedGroupRows({
  items,
  scrollContainerRef,
  contentRef,
  renderItem,
}: {
  items: GroupRowItem[];
  /** The board's shared scroll container (SprintBoard's contentScrollRef). */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Element wrapping ALL group cards. A group changing height shifts every group below
   *  it without resizing them or the scroller, so offsets re-measure off THIS element. */
  contentRef: React.RefObject<HTMLElement | null>;
  renderItem: (
    item: GroupRowItem,
    index: number,
    measureRef: (el: HTMLElement | null) => void,
  ) => ReactNode;
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  // BRDG-416 pattern: the virtualizer's scrollMargin is this group's row-body offset
  // within the shared scroll container. Render-time reads see 0 on first paint (ref not
  // attached), so measure in a layout effect and re-measure when the scroller or the
  // group stack changes size. Rect deltas (not offsetTop) because a tbody's offsetParent
  // is its table, not the scroll container.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const scroller = scrollContainerRef.current;
    if (!el || !scroller) return;
    const measure = () => {
      const next = Math.max(0, Math.round(
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop,
      ));
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [scrollContainerRef, contentRef]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
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
