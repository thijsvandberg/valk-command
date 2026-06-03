"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Sprint } from "@/types/ticket";
import { Popover } from "@/components/shared/Popover";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Pencil, Sparkles, ExternalLink, Flag } from "lucide-react";
import Link from "next/link";

interface SprintDetailsPopoverProps {
  sprint: Sprint;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSuggestGoal?: () => void;
  goalSuggestionUrl?: string | null;
  /** When provided and the sprint is active, shows a "Close sprint" action. */
  onCloseSprint?: () => void;
  /** Horizontal alignment relative to the trigger. Defaults to "left". */
  align?: "left" | "right";
  /**
   * When provided, the panel renders in a portal positioned (fixed) relative to this
   * trigger element instead of as an absolute child. This escapes ancestor
   * `overflow-hidden` clipping (e.g. a sprint group card) which would otherwise hide it.
   */
  anchorRef?: RefObject<HTMLElement | null>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function SprintDetailsPopover({
  sprint,
  open,
  onClose,
  onEdit,
  onSuggestGoal,
  goalSuggestionUrl,
  onCloseSprint,
  align = "left",
  anchorRef,
}: SprintDetailsPopoverProps) {
  const hasGoal = sprint.goal && sprint.goal.trim().length > 0;
  const hasDates = sprint.startDate && sprint.endDate;

  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  useOutsideClick(anchorRef ? [panelRef, anchorRef] : panelRef, onClose, { enabled: open && anchorRef != null });
  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open, anchorRef]);

  const inner = (
      <div className="px-3.5 py-3 space-y-2">
        {/* Date range row */}
        {hasDates && (
          <div className="text-body-sm text-text-secondary tabular-nums">
            {fmtDate(sprint.startDate!)} &ndash; {fmtDate(sprint.endDate!)}
          </div>
        )}

        {/* Goal */}
        {hasGoal ? (
          <p className="text-body-sm leading-relaxed text-text-primary">{sprint.goal}</p>
        ) : (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-body-sm italic text-text-muted">
              <span>No sprint goal set</span>
              {onSuggestGoal && !goalSuggestionUrl && (
                <button
                  type="button"
                  onClick={() => { onClose(); onSuggestGoal(); }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium not-italic cursor-pointer
                    text-[var(--color-brand-400)]
                    hover:bg-[var(--color-brand-500)]/10
                    active:bg-[var(--color-brand-500)]/15
                    transition-colors duration-100"
                >
                  <Sparkles size={10} strokeWidth={1.5} className="shrink-0" />
                  Suggest with AI
                </button>
              )}
            </p>
            {goalSuggestionUrl && (
              <Link
                href={goalSuggestionUrl}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium not-italic cursor-pointer
                  text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.06] border border-[var(--color-brand-500)]/20
                  hover:bg-[var(--color-brand-500)]/[0.12]
                  transition-colors duration-100"
              >
                <Sparkles size={10} strokeWidth={1.5} className="shrink-0" />
                AI suggestion available
                <ExternalLink size={9} strokeWidth={1.5} className="ml-auto shrink-0 opacity-60" />
              </Link>
            )}
          </div>
        )}

        {/* Divider + actions */}
        <div className="pt-0.5">
          <div className="h-px bg-border-default -mx-3.5 mb-2" />
          <button
            type="button"
            onClick={() => { onClose(); onEdit(); }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-body-sm text-text-secondary cursor-pointer
              hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong
              transition-colors duration-100"
          >
            <Pencil size={11} strokeWidth={1.5} className="shrink-0 opacity-60" />
            <span>Edit details</span>
          </button>
          {onCloseSprint && sprint.state === "active" && (
            <button
              type="button"
              onClick={() => { onClose(); onCloseSprint(); }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-body-sm text-amber-300/90 cursor-pointer
                hover:bg-amber-500/10 hover:text-amber-300 active:bg-amber-500/15
                transition-colors duration-100"
            >
              <Flag size={11} strokeWidth={1.5} className="shrink-0 opacity-80" />
              <span>Close sprint</span>
            </button>
          )}
        </div>
      </div>
  );

  // Portal mode: fixed-positioned panel anchored to the trigger, so an ancestor
  // card's `overflow-hidden` cannot clip it (BRDG group-row menu).
  if (anchorRef) {
    if (!open || !coords || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={panelRef}
        className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]"
        style={{ top: coords.top, right: coords.right }}
      >
        {inner}
      </div>,
      document.body,
    );
  }

  return (
    <Popover open={open} onClose={onClose} align={align} offsetClass="mt-2" className="w-64">
      {inner}
    </Popover>
  );
}
