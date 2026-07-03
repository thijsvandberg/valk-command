"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * A draggable two-pane split whose width is persisted per browser (localStorage).
 * Extracted from the test-doc review modal; the divider's `onPointerDown` calls
 * `handleSplitDrag` and the width is `splitPct`. Persistence happens DURING the
 * drag so a pointerup released outside the window can't lose the chosen width.
 */
export function usePersistedSplit(
  storageKey: string,
  { min, max, initial = 50 }: { min: number; max: number; initial?: number },
) {
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });

  const handleSplitDrag = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const onMove = (ev: PointerEvent) => {
        const pct = Math.min(max, Math.max(min, ((ev.clientX - rect.left) / rect.width) * 100));
        setSplitPct(pct);
        try {
          localStorage.setItem(storageKey, String(Math.round(pct)));
        } catch {
          /* in-memory only */
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [storageKey, min, max],
  );

  return { splitPct, splitRef, handleSplitDrag };
}
