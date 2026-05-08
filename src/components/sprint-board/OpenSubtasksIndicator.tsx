"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCheck, Loader2 } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";

interface OpenSubtasksIndicatorProps {
  ticketKey: string;
  jiraStatus: JiraStatus;
  openCount: number;
  totalCount: number;
  onCloseSubtasks?: (key: string) => Promise<void>;
}

function IndicatorPopover({
  ticketKey,
  openCount,
  totalCount,
  onCloseSubtasks,
  onClose,
  triggerRef,
}: {
  ticketKey: string;
  openCount: number;
  totalCount: number;
  onCloseSubtasks?: (key: string) => Promise<void>;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const POPOVER_HEIGHT = 140;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipped = spaceBelow < POPOVER_HEIGHT + 12;
    setPos({
      top: flipped ? rect.top - 6 : rect.bottom + 6,
      left: rect.left + rect.width / 2,
      flipped,
    });
  }, [triggerRef]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [onClose, triggerRef]);

  const handleClose = useCallback(async () => {
    if (!onCloseSubtasks || closing) return;
    setClosing(true);
    try {
      await onCloseSubtasks(ticketKey);
      onClose();
    } finally {
      setClosing(false);
    }
  }, [onCloseSubtasks, closing, ticketKey, onClose]);

  if (!pos || typeof document === "undefined") return null;

  const doneCount = totalCount - openCount;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        ...(pos.flipped ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
        left: pos.left,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
    >
      <div
        className="min-w-[220px] max-w-[280px] rounded-lg border border-border-strong overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div className="px-3 pt-2.5 pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <AlertTriangle size={12} strokeWidth={1.75} className="text-amber-400/80 shrink-0" />
            <span>{openCount} open subtask{openCount !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-3 pt-2 pb-1.5">
          <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
            <span>{doneCount} / {totalCount} done</span>
            <span>{Math.round((doneCount / totalCount) * 100)}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-overlay-default overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(doneCount / totalCount) * 100}%`,
                background: "linear-gradient(90deg, var(--color-brand-600), var(--color-brand-400))",
              }}
            />
          </div>
        </div>

        {/* Close button */}
        {onCloseSubtasks && (
          <div className="px-2 pb-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 active:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {closing ? (
                <>
                  <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                  Closing...
                </>
              ) : (
                <>
                  <CheckCheck size={12} strokeWidth={1.75} />
                  Close all subtasks
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function OpenSubtasksIndicator({
  ticketKey,
  jiraStatus,
  openCount,
  totalCount,
  onCloseSubtasks,
}: OpenSubtasksIndicatorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isClosedStatus = jiraStatus === "DONE" || jiraStatus === "DEPRECATED";

  if (!isClosedStatus || openCount === 0 || totalCount === 0) return null;

  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPopoverOpen((o) => !o);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none transition-colors duration-150 cursor-pointer bg-amber-500/10 text-amber-400/80 hover:bg-amber-500/18 hover:text-amber-300 active:bg-amber-500/25"
        title={`${openCount} of ${totalCount} subtasks still open`}
      >
        <AlertTriangle size={10} strokeWidth={1.75} className="shrink-0" />
        <span>{openCount}/{totalCount}</span>
      </button>
      {popoverOpen && (
        <IndicatorPopover
          ticketKey={ticketKey}
          openCount={openCount}
          totalCount={totalCount}
          onCloseSubtasks={onCloseSubtasks}
          onClose={() => setPopoverOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </span>
  );
}
