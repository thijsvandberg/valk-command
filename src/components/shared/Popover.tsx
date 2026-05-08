"use client";

import { useEffect, useRef, type ReactNode, type HTMLAttributes } from "react";

/**
 * Hook that fires `onClose` when a mousedown event lands outside of `ref`.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClose, enabled]);
}

/**
 * Floating panel that handles positioning, click-outside dismissal, and
 * ESC key. Used for dropdowns and popovers that are positioned relative
 * to a trigger element (non-portal mode).
 *
 * For portaled panels (e.g. NotificationBell), keep using createPortal
 * directly and use `useClickOutside` for the click-outside logic.
 */
interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  offsetClass?: string;
}

export function Popover({
  open,
  onClose,
  children,
  align = "right",
  offsetClass = "mt-1.5",
  className,
  ...rest
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, open);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const alignClass = align === "left" ? "left-0" : "right-0";

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 ${alignClass} ${offsetClass} overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_var(--color-overlay-subtle)]${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
