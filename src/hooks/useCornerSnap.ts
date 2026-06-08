"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocalStorage } from "./useLocalStorage";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CORNER_STORAGE_KEY = "bridge:focus-exit-corner";
export const DEFAULT_CORNER: Corner = "top-right";

// Movement (in px) the pointer must travel before a gesture counts as a drag
// rather than a click. Keeps a plain tap from ever snapping the button.
export const DRAG_THRESHOLD_PX = 4;

// Edge offset in px (matches the Tailwind `top-3`/`right-3` = 0.75rem resting offset)
// so the button never sits flush against the viewport edge in any corner.
export const CORNER_OFFSET_PX = 12;

// Spring-style snap duration; the easing overshoots slightly for a springy feel.
const SNAP_MS = 320;
const SNAP_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Resolve which viewport corner a point falls into by quadrant. A point in the
 * top-left quadrant maps to "top-left", etc. The center boundary biases toward
 * the bottom-right (uses strict `<`).
 */
export function cornerFromPoint(x: number, y: number, vw: number, vh: number): Corner {
  const top = y < vh / 2;
  const left = x < vw / 2;
  if (top) return left ? "top-left" : "top-right";
  return left ? "bottom-left" : "bottom-right";
}

// Resting top-left coordinate of the button for a given corner.
function restPosition(corner: Corner, vw: number, vh: number, w: number, h: number) {
  const left = corner === "top-left" || corner === "bottom-left"
    ? CORNER_OFFSET_PX
    : vw - CORNER_OFFSET_PX - w;
  const top = corner === "top-left" || corner === "top-right"
    ? CORNER_OFFSET_PX
    : vh - CORNER_OFFSET_PX - h;
  return { left, top };
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  rectLeft: number;
  rectTop: number;
  width: number;
  height: number;
  moved: boolean;
}

export interface CornerSnapResult {
  corner: Corner;
  isDragging: boolean;
  style: CSSProperties;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

/**
 * Makes a fixed corner-anchored button draggable: follows the pointer while
 * dragging, then snaps to whichever viewport quadrant it was released over and
 * persists that corner. A movement below the threshold is treated as a click.
 */
export function useCornerSnap(options: {
  enabled: boolean;
  onClick: () => void;
  /** Persisted-corner key; override so independent buttons remember separate corners. */
  storageKey?: string;
  defaultCorner?: Corner;
}): CornerSnapResult {
  const { enabled, onClick, storageKey = CORNER_STORAGE_KEY, defaultCorner = DEFAULT_CORNER } = options;
  const [corner, setCorner] = useLocalStorage<Corner>(storageKey, defaultCorner);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [snapOffset, setSnapOffset] = useState<{ x: number; y: number } | null>(null);

  const gesture = useRef<Gesture | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest values reachable from the stable window listeners.
  const enabledRef = useRef(enabled);
  const onClickRef = useRef(onClick);
  useEffect(() => {
    enabledRef.current = enabled;
    onClickRef.current = onClick;
  });

  const endGesture = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    gesture.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      g.moved = true;
      setIsDragging(true);
    }
    if (g.moved) {
      e.preventDefault();
      setDragOffset({ x: dx, y: dy });
    }
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    endGesture();

    if (!g.moved) {
      onClickRef.current();
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = g.rectLeft + g.width / 2 + dx;
    const centerY = g.rectTop + g.height / 2 + dy;
    const target = cornerFromPoint(centerX, centerY, vw, vh);
    const rest = restPosition(target, vw, vh, g.width, g.height);

    // Keep the old anchor during the animation and slide the transform from its
    // current drag offset to the new corner's resting position, so there is no
    // jump. Commit the new corner (switching the CSS anchor) once it settles.
    setDragOffset(null);
    setIsDragging(false);
    setSnapOffset({ x: rest.left - g.rectLeft, y: rest.top - g.rectTop });

    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      setCorner(target);
      setSnapOffset(null);
    }, SNAP_MS);
  }, [endGesture, setCorner]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabledRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture may be unavailable (older browsers / test env)
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClickRef.current();
    }
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (snapTimer.current) clearTimeout(snapTimer.current);
    };
  }, [onPointerMove, onPointerUp]);

  let style: CSSProperties = {};
  if (dragOffset) {
    style = {
      transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.05)`,
      transition: "none",
    };
  } else if (snapOffset) {
    style = {
      transform: `translate(${snapOffset.x}px, ${snapOffset.y}px)`,
      transition: `transform ${SNAP_MS}ms ${SNAP_EASING}`,
    };
  }

  return {
    corner,
    isDragging,
    style,
    handlers: { onPointerDown, onKeyDown },
  };
}

export const CORNER_CLASSES: Record<Corner, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};
