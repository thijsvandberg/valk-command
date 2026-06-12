"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MoreHorizontal, Pencil, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";

interface RefinementSessionMenuProps {
  sessionName: string;
  status: "draft" | "in_progress" | "completed";
  onRename?: () => void;
  /** Mark an active session as completed. Hidden when already completed. */
  onFinish?: () => void;
  /** Set a completed session back to in_progress. Only shown when completed. */
  onReopen?: () => void;
  onDelete?: () => void;
  /** Lets the parent keep the trigger visible while the menu is open. */
  onOpenChange?: (open: boolean) => void;
}

const MENU_WIDTH = 184;

export function RefinementSessionMenu({
  sessionName,
  status,
  onRename,
  onFinish,
  onReopen,
  onDelete,
  onOpenChange,
}: RefinementSessionMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const toggle = useCallback(() => {
    // Notify the parent outside the updater: React may run updaters during
    // render, and calling the parent's setState there is a render-phase update.
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  }, [open, onOpenChange]);

  // Anchor the portalled menu to the trigger, right-aligned, and keep it on
  // screen. Recomputed on scroll/resize while open since fixed positioning is
  // viewport-relative.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setCoords({ top: rect.bottom + 4, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useOutsideClick([triggerRef, menuRef], close, { enabled: open, escapeClose: false });

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  const isCompleted = status === "completed";
  const showFinish = onFinish && !isCompleted;
  const showReopen = onReopen && isCompleted;

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary transition-colors duration-150";

  const run = useCallback(
    (action: () => void) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      action();
      close();
    },
    [close],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggle();
        }}
        className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        aria-label={`Actions for ${sessionName}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={13} strokeWidth={1.5} />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
            style={{ top: coords.top, left: coords.left, width: MENU_WIDTH, animation: "fadeInUp 0.1s ease" }}
            role="menu"
          >
            {onRename && (
              <button type="button" role="menuitem" onClick={run(onRename)} className={itemClass}>
                <Pencil size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                Rename
              </button>
            )}

            {showFinish && (
              <button type="button" role="menuitem" onClick={run(onFinish)} className={itemClass}>
                <CheckCircle2 size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
                Finish refinement
              </button>
            )}

            {showReopen && (
              <button type="button" role="menuitem" onClick={run(onReopen)} className={itemClass}>
                <RotateCcw size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                Re-open refinement
              </button>
            )}

            {onDelete && (onRename || showFinish || showReopen) && (
              <div className="my-1 border-t border-border-default" role="separator" />
            )}

            {onDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={run(onDelete)}
                className={`${itemClass} text-[var(--color-danger-400)] hover:text-[var(--color-danger-300)]`}
              >
                <Trash2 size={12} strokeWidth={1.5} className="shrink-0" />
                Delete
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
