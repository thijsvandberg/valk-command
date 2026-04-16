"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "center" (default) centers vertically; "top" aligns near the top (for command/search palettes) */
  position?: "center" | "top";
  /** Extra classes on the backdrop element */
  backdropClassName?: string;
}

export function Modal({
  open,
  onClose,
  children,
  position = "center",
  backdropClassName,
}: ModalProps) {
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

  if (!open) return null;

  const alignClass = position === "top" ? "items-start pt-[12vh]" : "items-center";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center px-4 ${alignClass} bg-black/55 backdrop-blur-[3px]${backdropClassName ? ` ${backdropClassName}` : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
