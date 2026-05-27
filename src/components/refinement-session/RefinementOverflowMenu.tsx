"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MoreHorizontal, Clock } from "lucide-react";
import Link from "next/link";

export function RefinementOverflowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={`flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        aria-label="Refinement actions"
        data-testid="refinement-overflow-trigger"
      >
        <MoreHorizontal size={15} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
          style={{ animation: "fadeInUp 0.1s ease" }}
          role="menu"
          data-testid="refinement-overflow-menu"
        >
          <Link
            href="/refinement/history"
            role="menuitem"
            onClick={close}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          >
            <Clock size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
            Past refinements
          </Link>
        </div>
      )}
    </div>
  );
}
