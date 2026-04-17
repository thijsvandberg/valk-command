"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTORS =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "center" (default) centers vertically; "top" aligns near the top (for command/search palettes) */
  position?: "center" | "top";
  /** Extra classes on the backdrop element */
  backdropClassName?: string;
  /** Accessible label for the dialog */
  "aria-label"?: string;
}

export function Modal({
  open,
  onClose,
  children,
  position = "center",
  backdropClassName,
  "aria-label": ariaLabel,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, { capture: true });
    return () => document.removeEventListener("keydown", handleKey, { capture: true });
  }, [open, onClose]);

  // Focus trap: save previous focus, auto-focus first element, restore on close
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Auto-focus the first focusable element inside the modal
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      el?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Tab trap
  useEffect(() => {
    if (!open) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      ).filter((el) => !el.closest("[aria-hidden='true']"));

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  if (!open) return null;

  const alignClass = position === "top" ? "items-start pt-[12vh]" : "items-center";

  return createPortal(
    <div
      className={`fixed inset-0 z-modal flex justify-center px-4 ${alignClass} bg-black/55 backdrop-blur-[3px]${backdropClassName ? ` ${backdropClassName}` : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      ref={containerRef}
    >
      {children}
    </div>,
    document.body,
  );
}
