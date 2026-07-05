import { useCallback, useEffect, useState, type RefObject } from "react";

export type ScrollOverflow = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

/**
 * Tracks whether a horizontally-scrollable element still has hidden content to
 * the left/right, so callers can fade only the edges that have more to reveal.
 * Pass a `contentKey` (e.g. the rendered items) to re-check when the content
 * changes size without the container itself resizing.
 */
export function useScrollOverflow(
  ref: RefObject<HTMLElement | null>,
  contentKey?: unknown,
): ScrollOverflow {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [ref, check, contentKey]);

  return { canScrollLeft, canScrollRight };
}

const FADE_WIDTH_PX = 40;

/**
 * Builds a horizontal fade mask that dims only the edges with more content to
 * reveal. At the end of the scroll the right edge stays fully opaque, so the
 * last item is never washed out by a fade that has nothing left to hint at.
 */
export function scrollFadeMask({ canScrollLeft, canScrollRight }: ScrollOverflow): string {
  const leftEdge = canScrollLeft ? "transparent" : "black";
  const rightEdge = canScrollRight ? "transparent" : "black";
  return `linear-gradient(to right, ${leftEdge} 0, black ${FADE_WIDTH_PX}px, black calc(100% - ${FADE_WIDTH_PX}px), ${rightEdge} 100%)`;
}
