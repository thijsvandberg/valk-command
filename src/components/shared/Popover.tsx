"use client";

import { useRef, type ReactNode, type HTMLAttributes } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";

/**
 * Floating panel that handles positioning, click-outside dismissal, and
 * ESC key. Used for dropdowns and popovers that are positioned relative
 * to a trigger element (non-portal mode).
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
  useOutsideClick(ref, onClose, { enabled: open });

  if (!open) return null;

  const alignClass = align === "left" ? "left-0" : "right-0";

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 ${alignClass} ${offsetClass} overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
