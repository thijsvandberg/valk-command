"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Sprint } from "@/types/ticket";
import type { GroupSyncProgress, GroupSyncResult, GroupSyncState } from "@/lib/group-sync";
import { Popover } from "@/components/shared/Popover";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Pencil, Sparkles, ExternalLink, Flag, RefreshCw, ChevronRight, ChevronLeft, Check, Settings2 } from "lucide-react";
import Link from "next/link";

interface SprintDetailsPopoverProps {
  /** The sprint this group represents. Absent for epic groups (sync-only menu). */
  sprint?: Sprint;
  /** What the group represents; drives the sync label and which settings show. */
  kind?: "sprint" | "epic";
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onSuggestGoal?: () => void;
  goalSuggestionUrl?: string | null;
  /** When provided and the sprint is active, shows a "Close sprint" action. */
  onCloseSprint?: () => void;
  /**
   * When true, the menu's first level shows a "Sync" action. The sync lifecycle is
   * owned by the parent (so a header spinner can show while the menu is closed) and
   * passed back in via syncState/syncProgress/syncResult; clicking calls onRunSync.
   */
  canSync?: boolean;
  syncState?: GroupSyncState;
  syncProgress?: GroupSyncProgress | null;
  syncResult?: GroupSyncResult | null;
  onRunSync?: () => void;
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
  kind = "sprint",
  open,
  onClose,
  onEdit,
  onSuggestGoal,
  goalSuggestionUrl,
  onCloseSprint,
  canSync = false,
  syncState = "idle",
  syncProgress = null,
  syncResult = null,
  onRunSync,
  align = "left",
  anchorRef,
}: SprintDetailsPopoverProps) {
  const hasGoal = sprint?.goal && sprint.goal.trim().length > 0;
  const hasDates = sprint?.startDate && sprint?.endDate;
  // Settings only make sense for sprints (goal/dates/edit/close); epic groups get a
  // sync-only menu, so the two-level split collapses to a single level there.
  const hasSettings = sprint != null && (onEdit != null || onCloseSprint != null || hasDates || hasGoal);
  // The two-level split (Sync | Settings) only earns its keep when a sync action
  // exists. Without one, settings render directly so there is no pointless
  // single-item menu in front of them.
  const hasMenu = canSync;

  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [view, setView] = useState<"menu" | "settings">("menu");

  useOutsideClick(anchorRef ? [panelRef, anchorRef] : panelRef, onClose, { enabled: open && anchorRef != null });
  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open, anchorRef]);

  // Every fresh open lands on the top-level menu. Adjusting state during render
  // (not an effect) avoids a second commit; see
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setView("menu");
  }

  const syncLabel = kind === "epic" ? "Sync epic" : "Sync sprint";
  const fraction = syncProgress && syncProgress.total > 0 ? syncProgress.done / syncProgress.total : 0;
  const phaseLabel =
    syncProgress?.phase === "planning"
      ? "Preparing…"
      : syncProgress?.phase === "reconciling"
        ? "Finishing…"
        : syncProgress
          ? `Syncing ${syncProgress.done} of ${syncProgress.total}`
          : "";

  const syncRow = canSync && (
    <button
      type="button"
      onClick={() => onRunSync?.()}
      disabled={syncState === "running"}
      className="flex w-full flex-col gap-1.5 rounded-md px-2 py-1.5 text-body-sm text-text-secondary cursor-pointer
        hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong
        focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]
        disabled:cursor-default disabled:hover:bg-transparent
        [transition:background-color_.12s_ease,color_.12s_ease]"
    >
      <span className="flex w-full items-center gap-1.5">
        {syncState === "done" ? (
          <Check size={12} strokeWidth={2} className="shrink-0 text-[var(--color-status-success)]" />
        ) : (
          <RefreshCw
            size={11}
            strokeWidth={1.5}
            className={`shrink-0 opacity-60 ${syncState === "running" ? "motion-safe:animate-spin" : ""}`}
          />
        )}
        <span className={syncState === "error" ? "text-[var(--color-status-danger,#ef4444)]" : undefined}>
          {syncState === "running"
            ? phaseLabel
            : syncState === "done"
              ? `Synced ${syncResult?.synced ?? 0}${syncResult && syncResult.removed > 0 ? `, ${syncResult.removed} moved out` : ""}`
              : syncState === "error"
                ? "Sync failed — retry"
                : syncLabel}
        </span>
      </span>
      {syncState === "running" && syncProgress?.phase !== "planning" && (
        <span className="h-0.5 w-full overflow-hidden rounded-full bg-overlay-default" aria-hidden>
          <span
            className="block h-full origin-left rounded-full bg-[var(--color-brand-400)] [transition:transform_.2s_ease]"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </span>
      )}
    </button>
  );

  const menuView = (
    <div className="space-y-0.5">
      {syncRow}
      {hasSettings && (
        <button
          type="button"
          onClick={() => setView("settings")}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-body-sm text-text-secondary cursor-pointer
            hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong
            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]
            [transition:background-color_.12s_ease,color_.12s_ease]"
        >
          <Settings2 size={11} strokeWidth={1.5} className="shrink-0 opacity-60" />
          <span>Settings</span>
          <ChevronRight size={12} strokeWidth={1.5} className="ml-auto shrink-0 opacity-50" />
        </button>
      )}
    </div>
  );

  const settingsView = (
    <div className="space-y-2">
      {hasMenu && (
        <button
          type="button"
          onClick={() => setView("menu")}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 -mx-1 text-[11px] font-medium text-text-muted cursor-pointer
            hover:text-text-secondary active:text-text-primary
            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]
            [transition:color_.12s_ease]"
        >
          <ChevronLeft size={12} strokeWidth={1.5} className="shrink-0" />
          Back
        </button>
      )}

      {hasDates && (
        <div className="text-body-sm text-text-secondary tabular-nums">
          {fmtDate(sprint!.startDate!)} &ndash; {fmtDate(sprint!.endDate!)}
        </div>
      )}

      {hasGoal ? (
        <p className="text-body-sm leading-relaxed text-text-primary">{sprint!.goal}</p>
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

      <div className="pt-0.5">
        <div className="h-px bg-border-default -mx-3.5 mb-2" />
        {onEdit && (
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
        )}
        {onCloseSprint && sprint?.state === "active" && (
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

  // Without a menu, settings stand alone. With one, the menu leads and Settings
  // drills into the same block.
  const effectiveView = hasMenu ? view : "settings";
  const inner = (
    <div className="px-3.5 py-3">
      {effectiveView === "settings" && hasSettings ? settingsView : menuView}
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
