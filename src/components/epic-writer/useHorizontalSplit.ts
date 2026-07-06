"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_PCT = 25;
const MAX_PCT = 75;

function clamp(pct: number): number {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, pct));
}

function readStored(storageKey: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n) : fallback;
  } catch {
    return fallback;
  }
}

export interface HorizontalSplit {
  /** Width of the left pane as a percentage of the container (0-100). */
  leftPct: number;
  /** The container ref: attach to the flex row so drag deltas map to its width. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the drag handle's onMouseDown. */
  onHandleMouseDown: (e: React.MouseEvent) => void;
  dragging: boolean;
}

/**
 * A persisted, draggable horizontal split between two panes. Mirrors the
 * PaneArea divider mechanics (percentage widths, clamped) but is self-contained
 * for the Epic Writer's chat / breakdown split (BRDG-484). The chosen ratio is
 * saved to localStorage under `storageKey`, like the other layout prefs.
 */
export function useHorizontalSplit(storageKey: string, defaultLeftPct = 55): HorizontalSplit {
  const [leftPct, setLeftPct] = useState<number>(() => readStored(storageKey, defaultLeftPct));
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // Persist whenever the ratio settles (cheap; only writes a single number).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, String(Math.round(leftPct)));
    } catch {
      // ignore
    }
  }, [storageKey, leftPct]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(clamp(pct));
    };
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  return { leftPct, containerRef, onHandleMouseDown, dragging };
}
