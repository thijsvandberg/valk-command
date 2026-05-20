"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
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
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

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
          className="pointer-events-none fixed w-max max-w-xs rounded-lg border border-border-strong px-3 py-2 text-[13px] leading-relaxed normal-case tracking-normal font-normal text-text-primary"
          style={{
            top: position.flipUp ? undefined : position.top,
            bottom: position.flipUp ? window.innerHeight - position.top : undefined,
            left: position.left,
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
