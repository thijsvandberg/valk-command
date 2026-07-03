"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTORS =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Stack of open modals (BRDG-431): with nested dialogs (e.g. the Story Writer
// launcher plus its ConfirmDialog) only the TOPMOST modal may trap Tab and
// handle Escape, otherwise the traps fight over focus.
const modalStack: symbol[] = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "center" (default) centers vertically; "top" aligns near the top (for command/search palettes) */
  position?: "center" | "top";
  /** Extra classes on the backdrop element */
  backdropClassName?: string;
  /** Replaces the default alignment classes (e.g. a palette's custom top offset). */
  alignClassName?: string;
  /**
   * Drop the default dim + blur so the caller can animate its own backdrop
   * (entrance/exit). For an exit animation, keep `open` true while playing the
   * closing transition and flip it false afterwards - the command palette's
   * `closing` state is the reference implementation.
   */
  unstyledBackdrop?: boolean;
  /**
   * Let the caller own Escape (e.g. the palette, where Escape means "back"
   * inside a sub-flow). Default true: topmost modal closes on Escape.
   */
  closeOnEscape?: boolean;
  /** Accessible label for the dialog */
  "aria-label"?: string;
}

export function Modal({
  open,
  onClose,
  children,
  position = "center",
  backdropClassName,
  alignClassName,
  unstyledBackdrop = false,
  closeOnEscape = true,
  "aria-label": ariaLabel,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Stable identity on the modal stack (lazy state: refs must not be written in render).
  const [modalId] = useState(() => Symbol("modal"));

  // Register on the modal stack while open.
  useEffect(() => {
    if (!open) return;
    modalStack.push(modalId);
    return () => {
      const i = modalStack.indexOf(modalId);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [open, modalId]);

  // Escape key (topmost modal only)
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== modalId) return;
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", handleKey, { capture: true });
    return () => document.removeEventListener("keydown", handleKey, { capture: true });
  }, [open, closeOnEscape, onClose, modalId]);

  // Focus trap: save previous focus, auto-focus first element, restore on close
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Auto-focus: an explicit [data-autofocus] anchor wins (it may carry
    // tabindex=-1, adding no tab stop — used when the first focusable element
    // has focus side effects, e.g. a ticket pill opening its hover card);
    // otherwise the first focusable element inside the modal.
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const el =
        container.querySelector<HTMLElement>("[data-autofocus]") ??
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      el?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Tab trap (topmost modal only)
  useEffect(() => {
    if (!open) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (modalStack[modalStack.length - 1] !== modalId) return;
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
  }, [open, modalId]);

  if (!open) return null;

  const alignClass =
    alignClassName ?? (position === "top" ? "items-start pt-[12vh]" : "items-center");
  const backdropSkin = unstyledBackdrop ? "" : " bg-black/55 backdrop-blur-[3px]";

  return createPortal(
    <div
      className={`fixed inset-0 z-modal flex justify-center px-4 ${alignClass}${backdropSkin}${backdropClassName ? ` ${backdropClassName}` : ""}`}
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
