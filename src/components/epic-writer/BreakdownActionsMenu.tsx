"use client";

import { useRef, useState } from "react";
import {
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CloudUpload,
  Layers,
  CheckCheck,
  Link2,
  MapPin,
  Loader2,
} from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useSprintOptions } from "./useSprintOptions";
import { SprintPlacementOptions, placementLabel } from "./SprintPlacementOptions";

interface BreakdownActionsMenuProps {
  // Epic default placement + setter (BRDG-500 #1). When onSet is provided the
  // menu shows a "New stories" row that drills into the placement picker.
  childPlacement: string | null;
  onSetChildPlacement?: (placement: string | null) => void | Promise<unknown>;
  // Bulk master actions (BRDG-500 #3-#5). Each row is shown only when there is
  // something to act on (counts / hasDeepenable).
  onCreateAll?: () => void | Promise<unknown>;
  onDeepenAll?: () => void | Promise<unknown>;
  onConfirmAll?: () => void | Promise<unknown>;
  onLinkExisting?: () => void;
  draftCount: number;
  confirmableCount: number;
  hasDeepenable: boolean;
  // A chat turn is running (disables Deepen all, which is a chat turn).
  busy?: boolean;
  // A board bulk loop (Create all / Confirm all) is running.
  bulkBusy?: boolean;
}

const rowCls =
  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * The breakdown board's single Actions menu (BRDG-500 UX pass): folds the
 * occasional controls - epic placement, the Create/Deepen/Confirm-all master
 * actions, and Link existing - behind one trigger so the header shows only
 * Collapse all + the count. Placement drills into a sub-page (the shared
 * SprintPlacementOptions) rather than listing every sprint at the top level.
 */
export function BreakdownActionsMenu({
  childPlacement,
  onSetChildPlacement,
  onCreateAll,
  onDeepenAll,
  onConfirmAll,
  onLinkExisting,
  draftCount,
  confirmableCount,
  hasDeepenable,
  busy,
  bulkBusy,
}: BreakdownActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"root" | "placement">("root");
  const ref = useRef<HTMLDivElement>(null);
  const { sprints, defaultSprintId, loaded } = useSprintOptions(open);

  const close = () => {
    setOpen(false);
    setPage("root");
  };
  useOutsideClick(ref, close, { enabled: open });

  const run = (fn?: () => void | Promise<unknown>) => {
    close();
    if (fn) void fn();
  };

  const showCreateAll = draftCount > 0 && !!onCreateAll;
  const showDeepenAll = hasDeepenable && !!onDeepenAll;
  const showConfirmAll = confirmableCount > 0 && !!onConfirmAll;
  const hasBulk = showCreateAll || showDeepenAll || showConfirmAll;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-border-subtle bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
        title="Board actions: placement, bulk create / deepen / confirm, link existing"
      >
        <MoreHorizontal size={13} strokeWidth={1.75} />
        Actions
        <ChevronDown size={10} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border-default bg-surface-elevated py-1 shadow-popover"
        >
          {page === "root" ? (
            <>
              {onSetChildPlacement && (
                <button type="button" role="menuitem" onClick={() => setPage("placement")} className={rowCls}>
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                    New stories
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-label text-text-muted">
                    <span className="max-w-[10ch] truncate">{placementLabel(childPlacement, sprints)}</span>
                    <ChevronRight size={13} strokeWidth={2} />
                  </span>
                </button>
              )}

              {onSetChildPlacement && hasBulk && <div className="my-1 border-t border-border-subtle" />}

              {showCreateAll && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={bulkBusy}
                  onClick={() => run(onCreateAll)}
                  className={rowCls}
                >
                  <span className="flex items-center gap-2">
                    <CloudUpload size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                    Create all in Jira
                  </span>
                  <span className="shrink-0 text-label text-text-muted">{draftCount}</span>
                </button>
              )}

              {showDeepenAll && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy || bulkBusy}
                  onClick={() => run(onDeepenAll)}
                  className={rowCls}
                >
                  <span className="flex items-center gap-2">
                    <Layers size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                    Deepen all
                  </span>
                </button>
              )}

              {showConfirmAll && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={bulkBusy}
                  onClick={() => run(onConfirmAll)}
                  className={rowCls}
                >
                  <span className="flex items-center gap-2">
                    <CheckCheck size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                    Confirm all links
                  </span>
                  <span className="shrink-0 text-label text-text-muted">{confirmableCount}</span>
                </button>
              )}

              {onLinkExisting && (hasBulk || onSetChildPlacement) && (
                <div className="my-1 border-t border-border-subtle" />
              )}

              {onLinkExisting && (
                <button type="button" role="menuitem" onClick={() => run(onLinkExisting)} className={rowCls}>
                  <span className="flex items-center gap-2">
                    <Link2 size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                    Link existing story
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPage("root")}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <ChevronLeft size={13} strokeWidth={2} />
                New stories in
              </button>
              <div className="my-1 border-t border-border-subtle" />
              <SprintPlacementOptions
                variant="setting"
                sprints={sprints}
                defaultSprintId={defaultSprintId}
                loaded={loaded}
                selectedPlacement={childPlacement}
                onChoose={(p) => run(() => onSetChildPlacement?.(p))}
                onClear={() => run(() => onSetChildPlacement?.(null))}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
