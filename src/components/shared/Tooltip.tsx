"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
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
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible && position && (
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed z-tooltip max-w-xs rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-2.5 py-1.5 text-xs text-text-primary shadow-[var(--shadow-md)]"
          style={{
            top: position.top,
            left: position.left,
            transform: "translateX(-50%)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.12s ease",
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
