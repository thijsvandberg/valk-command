"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}

// Keep the tooltip this far from the viewport edges when clamping (BRDG-239).
const VIEWPORT_MARGIN = 8;

export function Tooltip({ content, children, delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  // Clamped left edge (px). null until measured -> first paint uses the centered anchor.
  const [clampedLeft, setClampedLeft] = useState<number | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < 120;
        setPosition({
          top: flipUp ? rect.top - 6 : rect.bottom + 6,
          left: rect.left + rect.width / 2,
          flipUp,
        });
      }
      setVisible(true);
    }, delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
    setPosition(null);
    setClampedLeft(null);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  // After the tooltip renders, clamp it horizontally so a near-edge trigger (e.g. the
  // right-most metric on a board row) never pushes the bubble off-screen. Runs before
  // paint, so the centered first frame is never visible.
  useLayoutEffect(() => {
    if (!visible || !position || !tooltipRef.current) return;
    const width = tooltipRef.current.offsetWidth;
    const half = width / 2;
    const min = VIEWPORT_MARGIN + half;
    const max = window.innerWidth - VIEWPORT_MARGIN - half;
    const centerX = Math.max(min, Math.min(position.left, max));
    setClampedLeft(centerX);
  }, [visible, position]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible && position && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed w-max max-w-xs rounded-lg border border-border-strong px-3 py-2 text-[13px] leading-relaxed normal-case tracking-normal font-normal text-text-primary"
          style={{
            top: position.flipUp ? undefined : position.top,
            bottom: position.flipUp ? window.innerHeight - position.top : undefined,
            left: clampedLeft ?? position.left,
            transform: "translateX(-50%)",
            zIndex: 9999,
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
