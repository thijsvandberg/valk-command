"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "@/components/shared/AnchoredPanel";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  /** Extra classes for the trigger wrapper, e.g. `min-w-0` so a truncating child still shrinks. */
  className?: string;
}

/**
 * The one text tooltip (BRDG-430). Centered under (or above, on collision) the
 * trigger; positioning comes from the shared anchored-panel engine and the
 * layer is the z-tooltip token.
 */
export function Tooltip({ content, children, delay = 400, className = "" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { panelRef, pos } = useAnchoredPosition({
    anchorRef: triggerRef,
    placement: "bottom",
    gap: 6,
    enabled: visible,
  });

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="pointer-events-none fixed w-max max-w-xs rounded-lg border border-border-strong px-3 py-2 text-body leading-relaxed normal-case tracking-normal font-normal text-text-primary"
          style={{
            top: pos?.y ?? 0,
            left: pos?.x ?? 0,
            visibility: pos ? "visible" : "hidden",
            zIndex: "var(--z-tooltip)",
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
