"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TicketChangeKind } from "@/lib/ticket-events";

const DEFAULT_DURATION_MS = 1_800;

const EMPTY: ReadonlySet<TicketChangeKind> = new Set();

/**
 * Tracks which change kinds are currently "flashing" after a live update.
 * `trigger(kinds)` activates them; each kind deactivates again after
 * `durationMs` (matching the CSS livePulse animation length). Consumers apply
 * the `live-pulse` class to the element that renders an active kind.
 */
export function useChangeHighlight(durationMs: number = DEFAULT_DURATION_MS) {
  const [activeKinds, setActiveKinds] = useState<ReadonlySet<TicketChangeKind>>(EMPTY);
  const timers = useRef<Map<TicketChangeKind, ReturnType<typeof setTimeout>>>(new Map());

  const trigger = useCallback((kinds: TicketChangeKind[]) => {
    if (kinds.length === 0) return;
    setActiveKinds((prev) => {
      const next = new Set(prev);
      for (const kind of kinds) next.add(kind);
      return next;
    });
    for (const kind of kinds) {
      const existing = timers.current.get(kind);
      if (existing) clearTimeout(existing);
      timers.current.set(kind, setTimeout(() => {
        timers.current.delete(kind);
        setActiveKinds((prev) => {
          if (!prev.has(kind)) return prev;
          const next = new Set(prev);
          next.delete(kind);
          return next;
        });
      }, durationMs));
    }
  }, [durationMs]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return { activeKinds, trigger };
}
