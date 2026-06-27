"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCheck, Loader2, Circle, CircleCheckBig } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";

interface SubtaskItem {
  key: string;
  title: string;
  status: string;
}

interface OpenSubtasksIndicatorProps {
  ticketKey: string;
  jiraStatus: JiraStatus;
  openCount: number;
  totalCount: number;
  onCloseSubtasks?: (key: string) => Promise<void>;
  /** Spell out "N open subtasks" instead of the bare count (BRDG-414 status-change line). */
  descriptive?: boolean;
}

const DONE_STATUSES = new Set(["DONE", "DEPRECATED", "Done", "Closed"]);

export function IndicatorPopover({
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
  const [subtasks, setSubtasks] = useState<SubtaskItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const POPOVER_HEIGHT = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipped = spaceBelow < POPOVER_HEIGHT + 12;
    setPos({
      top: flipped ? rect.top - 6 : rect.bottom + 6,
      left: rect.left + rect.width / 2,
      flipped,
    });
  }, [triggerRef]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/subtasks`)
      .then((r) => r.json())
      .then((data: SubtaskItem[]) => {
        if (!cancelled) setSubtasks(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, [ticketKey]);

  useOutsideClick([ref, triggerRef], onClose);

  useEffect(() => {
    function handleScroll(e: Event) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [onClose]);

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

  const openSubtasks = subtasks?.filter((s) => !DONE_STATUSES.has(s.status)) ?? [];
  const closedSubtasks = subtasks?.filter((s) => DONE_STATUSES.has(s.status)) ?? [];

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
        className="min-w-[260px] max-w-[340px] rounded-lg border border-border-strong overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.10), 0 8px 32px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <div className="px-3 pt-2.5 pb-2 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-body-sm font-medium text-text-primary">
              <AlertTriangle size={12} strokeWidth={2} className="text-amber-400 shrink-0" />
              <span>{openCount} of {totalCount} subtasks open</span>
            </div>
          </div>
        </div>

        {/* Subtask list */}
        <div className="max-h-[240px] overflow-y-auto">
          {!subtasks && !loadError && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin text-text-muted" />
            </div>
          )}

          {loadError && (
            <div className="px-3 py-3 text-body-sm text-text-muted">
              Failed to load subtasks
            </div>
          )}

          {subtasks && (
            <div className="py-1">
              {/* Open subtasks */}
              {openSubtasks.map((sub) => (
                <div key={sub.key} className="flex items-start gap-2 px-3 py-1.5">
                  <Circle size={12} strokeWidth={1.75} className="text-amber-400/90 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-body-sm text-text-primary leading-snug line-clamp-2">{sub.title}</span>
                    <span className="block text-[10px] text-text-muted mt-0.5">{sub.key} · {sub.status}</span>
                  </div>
                </div>
              ))}

              {/* Divider between open and closed */}
              {openSubtasks.length > 0 && closedSubtasks.length > 0 && (
                <div className="mx-3 my-1 border-t border-border-subtle" />
              )}

              {/* Closed subtasks */}
              {closedSubtasks.map((sub) => (
                <div key={sub.key} className="flex items-start gap-2 px-3 py-1.5 opacity-50">
                  <CircleCheckBig size={12} strokeWidth={1.5} className="text-green-400/70 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-body-sm text-text-primary leading-snug line-clamp-2">{sub.title}</span>
                    <span className="block text-[10px] text-text-muted mt-0.5">{sub.key}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close button */}
        {onCloseSubtasks && (
          <div className="px-2 pb-2 pt-1 border-t border-border-subtle">
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm font-semibold transition-colors duration-150 cursor-pointer text-[color-mix(in_srgb,var(--color-status-warning)_78%,var(--color-text-primary))] bg-[color-mix(in_srgb,var(--color-status-warning)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-status-warning)_26%,transparent)] active:bg-[color-mix(in_srgb,var(--color-status-warning)_32%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
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
  descriptive = false,
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
        className="inline-flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium tabular-nums leading-none transition-colors duration-150 cursor-pointer bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 active:bg-amber-500/30"
        title={`${openCount} of ${totalCount} subtasks still open`}
      >
        <AlertTriangle size={10} strokeWidth={1.75} className="shrink-0" />
        <span>{descriptive ? `${openCount} open subtask${openCount === 1 ? "" : "s"}` : openCount}</span>
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
