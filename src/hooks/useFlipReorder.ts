import { useLayoutEffect, useRef } from "react";

// FLIP reorder animation. Attach the returned ref to a list container whose direct
// descendants each carry a stable `data-ticket-key`. When the order of `keys`
// changes between renders, every row that moved slides from its previous position
// to its new one using a transform-only animation, so the reorder reads as motion
// rather than a jump. offsetTop (not getBoundingClientRect) keeps the deltas
// correct regardless of scroll. Honors prefers-reduced-motion.
export function useFlipReorder(keys: string[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevTops = useRef<Map<string, number>>(new Map());
  const orderKey = keys.join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rows = container.querySelectorAll<HTMLElement>("[data-ticket-key]");
    const nextTops = new Map<string, number>();

    rows.forEach((row) => {
      const key = row.dataset.ticketKey;
      if (!key) return;
      const top = row.offsetTop;
      nextTops.set(key, top);
      const prev = prevTops.current.get(key);
      if (!reduceMotion && prev != null && prev !== top) {
        row.animate(
          [{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }],
          { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    });

    prevTops.current = nextTops;
  }, [orderKey]);

  return containerRef;
}
