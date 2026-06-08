"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Sprint } from "@/types/ticket";
import type { GroupSyncProgress, GroupSyncResult, GroupSyncState } from "@/lib/group-sync";
import { Popover } from "@/components/shared/Popover";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Sparkles, ExternalLink, CircleCheck, Play, RefreshCw, Check, Settings2 } from "lucide-react";
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
  /** When provided and the sprint is in the future, shows a "Start sprint" action. */
  onStartSprint?: () => void;
  /** When provided, shows an "Open in Jira" link to the sprint's board backlog. */
  jiraUrl?: string | null;
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

export function SprintDetailsPopover({
  sprint,
  kind = "sprint",
  open,
  onClose,
  onEdit,
  onSuggestGoal,
  goalSuggestionUrl,
  onCloseSprint,
  onStartSprint,
  jiraUrl,
  canSync = false,
  syncState = "idle",
  syncProgress = null,
  syncResult = null,
  onRunSync,
  align = "left",
  anchorRef,
}: SprintDetailsPopoverProps) {
  const hasGoal = !!sprint?.goal && sprint.goal.trim().length > 0;

  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  useOutsideClick(anchorRef ? [panelRef, anchorRef] : panelRef, onClose, { enabled: open && anchorRef != null });
  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open, anchorRef]);

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

  // Item geometry matches the board's regular "More options" menu: full-width rows,
  // tight px-3 py-2 padding (no nested padding layer), 13px icons.
  const rowBase = "flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150";
  const neutralRow = `${rowBase} text-text-secondary hover:bg-hover-interactive hover:text-text-primary`;
  const brandRow = `${rowBase} text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-300)]`;

  const items: ReactNode[] = [];

  if (canSync) {
    items.push(
      <button
        key="sync"
        type="button"
        onClick={() => onRunSync?.()}
        disabled={syncState === "running"}
        className={`flex w-full flex-col gap-1.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer
          hover:bg-hover-interactive hover:text-text-primary
          disabled:cursor-default disabled:hover:bg-transparent
          transition-colors duration-150`}
      >
        <span className="flex w-full items-center gap-2.5">
          {syncState === "done" ? (
            <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-status-success)]" />
          ) : (
            <RefreshCw
              size={13}
              strokeWidth={1.5}
              className={`shrink-0 ${syncState === "running" ? "motion-safe:animate-spin" : ""}`}
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
      </button>,
    );
  }

  // "Sprint settings" opens the edit modal directly (no sub-panel). The sprint goal
  // is intentionally not shown here; it lives in that modal.
  if (onEdit) {
    items.push(
      <button key="settings" type="button" onClick={() => { onClose(); onEdit(); }} className={neutralRow}>
        <Settings2 size={13} strokeWidth={1.5} className="shrink-0" />
        <span>Sprint settings</span>
      </button>,
    );
  }

  // Goal-suggestion affordances (single-sprint header only): an action to generate
  // a goal, or a link to a ready suggestion. No goal text is rendered.
  if (onSuggestGoal && !hasGoal && !goalSuggestionUrl) {
    items.push(
      <button key="suggest" type="button" onClick={() => { onClose(); onSuggestGoal(); }} className={brandRow}>
        <Sparkles size={13} strokeWidth={1.5} className="shrink-0" />
        <span>Suggest goal with AI</span>
      </button>,
    );
  }
  if (goalSuggestionUrl) {
    items.push(
      <Link key="ai" href={goalSuggestionUrl} onClick={onClose} className={brandRow}>
        <Sparkles size={13} strokeWidth={1.5} className="shrink-0" />
        <span>AI suggestion available</span>
        <ExternalLink size={11} strokeWidth={1.5} className="ml-auto shrink-0 opacity-60" />
      </Link>,
    );
  }

  if (onStartSprint && sprint?.state === "future") {
    items.push(
      <button key="start" type="button" onClick={() => { onClose(); onStartSprint(); }} className={brandRow}>
        <Play size={13} strokeWidth={1.5} className="shrink-0" />
        <span>Start sprint</span>
      </button>,
    );
  }
  if (onCloseSprint && sprint?.state === "active") {
    items.push(
      <button
        key="close"
        type="button"
        onClick={() => { onClose(); onCloseSprint(); }}
        className={`${rowBase} text-[var(--color-status-warning)] hover:bg-[var(--color-status-warning-subtle)]`}
      >
        <CircleCheck size={13} strokeWidth={1.5} className="shrink-0" />
        <span>Close sprint</span>
      </button>,
    );
  }

  if (jiraUrl) {
    items.push(
      <a key="jira" href={jiraUrl} target="_blank" rel="noopener noreferrer" onClick={onClose} className={neutralRow}>
        <ExternalLink size={13} strokeWidth={1.5} className="shrink-0" />
        <span>Open in Jira</span>
      </a>,
    );
  }

  const inner = <div className="py-1.5">{items}</div>;

  // Portal mode: fixed-positioned panel anchored to the trigger, so an ancestor
  // card's `overflow-hidden` cannot clip it (BRDG group-row menu).
  if (anchorRef) {
    if (!open || !coords || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={panelRef}
        className="fixed z-[9999] w-56 overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)]"
        style={{ top: coords.top, right: coords.right }}
      >
        {inner}
      </div>,
      document.body,
    );
  }

  return (
    <Popover open={open} onClose={onClose} align={align} offsetClass="mt-2" className="w-56">
      {inner}
    </Popover>
  );
}
