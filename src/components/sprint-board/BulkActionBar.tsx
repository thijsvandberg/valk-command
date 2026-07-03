"use client";

import { useState, useRef, type ReactNode } from "react";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Button } from "@/components/ui/Button";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Checkbox } from "@/components/shared/Checkbox";
import {
  type LucideIcon,
  ArrowRightLeft,
  Boxes,
  Check,
  ChevronDown,
  Copy,
  FilePen,
  Flag,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { AnchoredMenu, MenuItem, TicketActionMenuContent, type FlagState } from "@/components/sprint-board/ticket-action-menu";
import type { QuickMoveOption } from "@/lib/quick-moves";

// ---------------------------------------------------------------------------
// Bar building blocks (BRDG-374): icon-only group dropdowns + single-action
// icons. A group with a menu opens a dropdown (caret cue beside the icon); a
// single action fires immediately. Both read their content from the shared
// TicketActionMenuContent so the bar and the right-click menu cannot drift.
// ---------------------------------------------------------------------------

function GroupDropdown({
  label,
  icon: Icon,
  busy,
  width = "w-[300px]",
  render,
}: {
  label: string;
  icon: LucideIcon;
  busy?: boolean;
  width?: string;
  render: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick([ref, menuRef], () => setOpen(false), { enabled: open });

  // The hover tooltip is suppressed while the dropdown is open, otherwise it lingers
  // on top of the just-opened menu (BRDG-374 feedback).
  const trigger = (
    <button
      type="button"
      aria-label={label}
      onClick={() => setOpen((v) => !v)}
      className="flex h-9 cursor-pointer items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      {busy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.5} />
      ) : (
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      )}
      <ChevronDown className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
    </button>
  );
  return (
    <div ref={ref} className="relative">
      {open ? trigger : <Tooltip content={label}>{trigger}</Tooltip>}
      {open && (
        <AnchoredMenu anchorRef={ref} menuRef={menuRef} width={width}>
          {render(() => setOpen(false))}
        </AnchoredMenu>
      )}
    </div>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled || busy}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        {busy ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.5} />
        ) : (
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        )}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// BulkActionBar
// ---------------------------------------------------------------------------

export function BulkActionBar({
  count,
  selectedPoints,
  selectedEffectivePoints,
  selectedBV,
  allChecked,
  totalCount,
  onToggleAll,
  onClear,
  // Inbox-specific prominent primary action (BRDG-373); inert elsewhere.
  onMarkRead,
  markReadCount,
  // Update group actions
  onSetReadiness,
  onSetStatus,
  onSetEpic,
  onMoveSprint,
  quickMoves,
  onQuickMove,
  onUpdateAssignee,
  onUpdateLabel,
  onSetFlagged,
  flagState,
  sprints,
  pinnedSprintIds,
  currentSprintIds,
  // Assist group actions
  onReviewStory,
  onGenerateSubtasks,
  onGenerateTestDocs,
  onExportForStakeholders,
  isExporting,
  isGeneratingSubtasks,
  // List-level actions
  onRefreshFromJira,
  onCopyToClipboard,
  onRefine,
  refinements,
  onAddToRefinement,
  isRefreshing,
  floating,
}: {
  count: number;
  selectedPoints?: number;
  // SP + guestimate total (effective points): SP where set, else the guestimate. Only
  // rendered when it exceeds selectedPoints, i.e. some selected ticket is guestimate-only.
  selectedEffectivePoints?: number;
  selectedBV?: number;
  allChecked?: boolean;
  totalCount?: number;
  onToggleAll?: () => void;
  onClear: () => void;
  /**
   * Inbox "Mark as read" (BRDG-373): when provided, a prominent leading primary
   * button is rendered before the action groups. The board / epic children omit
   * it, so their bar renders without it.
   */
  onMarkRead?: () => void;
  markReadCount?: number;
  // Update group
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetStatus?: (status: JiraStatus) => void;
  onSetEpic?: (epicKey: string | null, epicName: string | null) => void;
  onMoveSprint?: (sprintId: string, position?: "top" | "bottom") => void;
  /** One-click move destinations shown above "More sprints" (BRDG-369). */
  quickMoves?: QuickMoveOption[];
  /** The selection's current sprint id(s); excluded from the Move dropdown's "More sprints". */
  currentSprintIds?: string[];
  onQuickMove?: (opt: QuickMoveOption) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null, avatar: string | null) => void;
  onUpdateLabel?: (labels: string[], mode: "add" | "set") => void;
  onSetFlagged?: (flagged: boolean) => void;
  flagState?: FlagState;
  sprints?: Sprint[];
  /** Pinned (slot) sprint IDs, in pinned order; shown first in the Move to Sprint list. */
  pinnedSprintIds?: string[];
  // Assist group
  onReviewStory?: () => void;
  onGenerateSubtasks?: () => void;
  /** Opens the test-doc generate + validate queue for the selection (BRDG-426). */
  onGenerateTestDocs?: () => void;
  onExportForStakeholders?: () => void;
  isExporting?: boolean;
  isGeneratingSubtasks?: boolean;
  // List-level
  onRefreshFromJira?: () => void;
  onCopyToClipboard?: () => void;
  /** "New refinement…": opens the create-session modal. */
  onRefine?: () => void;
  /** Scheduled refinement sessions; when present, Refinement becomes a dropdown of
   *  sessions + "New refinement…" (BRDG-374). */
  refinements?: { id: string; name: string; count?: number }[];
  onAddToRefinement?: (sessionId: string) => void;
  isRefreshing?: boolean;
  /**
   * Renders the bar as a self-contained, rounded, elevated pill that floats a
   * few px above the content. Used inside contained panels (e.g. the epic
   * detail "Child Issues" view) so the bar matches the rounded-card language
   * instead of reading as a flat full-bleed strip. Page-level views keep the
   * default full-bleed footer.
   */
  floating?: boolean;
}) {
  const hasUpdate = onSetStatus || onSetReadiness || onSetEpic || onUpdateAssignee || onUpdateLabel;
  const hasMove = (onQuickMove && quickMoves && quickMoves.length > 0) || (onMoveSprint && sprints);
  const hasAssist = onReviewStory || onGenerateSubtasks || onGenerateTestDocs || onExportForStakeholders;
  const hasGroup = hasUpdate || hasMove || onSetFlagged || hasAssist;
  const hasListOps = onRefine || onCopyToClipboard || onRefreshFromJira;

  return (
    <BarContainer
      border={!floating}
      borderPosition="top"
      className={
        floating
          ? "bulk-bar-enter sticky bottom-3 z-50 -mx-3 mt-3 gap-2 rounded-xl border border-border-default bg-surface-floating shadow-lg sm:-mx-4 sm:gap-2.5"
          : "bulk-bar-enter sticky bottom-0 z-50 gap-2 bg-surface-base sm:gap-2.5"
      }
    >
      {/* Select all / deselect all checkbox */}
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="flex shrink-0 items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          title={allChecked ? "Deselect all" : "Select all"}
        >
          <Checkbox checked={!!allChecked} indeterminate={!allChecked} />
        </button>
      )}

      {/* Selection counter with optional SP and BV badges (off where not tracked, e.g. inbox) */}
      <span className="shrink-0 flex items-center gap-2 text-body-sm font-medium text-text-secondary whitespace-nowrap tabular-nums">
        <span>{count}{totalCount ? `/${totalCount}` : ""} selected</span>
        {selectedPoints !== undefined && selectedPoints > 0 && (
          <MetricBadge metric="sp" value={selectedPoints} tinted />
        )}
        {/* SP + guestimate: only when a guestimate-only ticket lifts the total above SP-only. */}
        {selectedEffectivePoints !== undefined &&
          selectedPoints !== undefined &&
          selectedEffectivePoints > selectedPoints && (
            <MetricBadge
              metric="sp"
              value={selectedEffectivePoints}
              penciled
              tooltipContent="Story Points + guestimate for unestimated tickets"
            />
          )}
        {selectedBV !== undefined && selectedBV > 0 && (
          <MetricBadge metric="bv" value={selectedBV} tinted />
        )}
      </span>

      <BarDivider />

      {/* Inbox primary action (BRDG-373): prominent "Mark as read", first in the bar. */}
      {onMarkRead && (
        <>
          <Tooltip content="Mark the selected stories as read; they leave the inbox (undoable)">
            <Button variant="primary" size="md" onClick={onMarkRead}>
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="hidden sm:inline">Mark {markReadCount} as read</span>
              <span className="sm:hidden">Read</span>
            </Button>
          </Tooltip>
          <BarDivider />
        </>
      )}

      {/* Action groups: icon + caret, content shared with the right-click menu. */}
      {hasUpdate && (
        <GroupDropdown
          label="Update"
          icon={FilePen}
          render={(close) => (
            <TicketActionMenuContent
              onSetStatus={onSetStatus}
              onSetReadiness={onSetReadiness}
              onSetEpic={onSetEpic}
              epicClearable
              onUpdateAssignee={onUpdateAssignee}
              onUpdateLabel={onUpdateLabel}
              initialView="update"
              close={close}
            />
          )}
        />
      )}
      {hasMove && (
        <GroupDropdown
          label="Move"
          icon={ArrowRightLeft}
          render={(close) => (
            <TicketActionMenuContent
              onMoveSprint={onMoveSprint}
              quickMoves={quickMoves}
              onQuickMove={onQuickMove}
              sprints={sprints}
              pinnedSprintIds={pinnedSprintIds}
              currentSprintIds={currentSprintIds}
              initialView="move"
              close={close}
            />
          )}
        />
      )}
      {onSetFlagged && (
        <GroupDropdown
          label="Flag"
          icon={Flag}
          width="w-52"
          render={(close) => (
            <TicketActionMenuContent onSetFlagged={onSetFlagged} flagState={flagState} initialView="flag" close={close} />
          )}
        />
      )}
      {hasAssist && (
        <GroupDropdown
          label="Assist"
          icon={Sparkles}
          busy={isExporting || isGeneratingSubtasks}
          width="w-52"
          render={(close) => (
            <>
              {onReviewStory && <MenuItem onClick={() => { onReviewStory(); close(); }}>Review Story</MenuItem>}
              {onGenerateSubtasks && (
                <MenuItem disabled={isGeneratingSubtasks} onClick={() => { onGenerateSubtasks(); close(); }}>
                  {isGeneratingSubtasks ? "Generating..." : "Generate Subtasks"}
                </MenuItem>
              )}
              {onGenerateTestDocs && (
                <MenuItem onClick={() => { onGenerateTestDocs(); close(); }}>Generate test docs</MenuItem>
              )}
              {onExportForStakeholders && (
                <MenuItem disabled={isExporting} onClick={() => { onExportForStakeholders(); close(); }}>
                  {isExporting ? "Exporting..." : "Summarized List"}
                </MenuItem>
              )}
            </>
          )}
        />
      )}

      {hasGroup && hasListOps && <BarDivider />}

      {/* List-level single actions */}
      {refinements && refinements.length > 0 && onAddToRefinement ? (
        <GroupDropdown
          label="Add to refinement"
          icon={Boxes}
          width="w-56"
          render={(close) => (
            <>
              {refinements.map((r) => (
                <MenuItem key={r.id} onClick={() => { onAddToRefinement(r.id); close(); }}>
                  <span className="truncate">{r.name}</span>
                  {r.count != null && (
                    <span className="ml-auto shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-tertiary">
                      {r.count}
                    </span>
                  )}
                </MenuItem>
              ))}
              {onRefine && (
                <>
                  <div className="mx-2 my-1 h-px bg-overlay-strong" />
                  <MenuItem onClick={() => { onRefine(); close(); }}>New refinement…</MenuItem>
                </>
              )}
            </>
          )}
        />
      ) : (
        onRefine && <IconAction label="Add to refinement" icon={Boxes} onClick={onRefine} />
      )}
      {onCopyToClipboard && <IconAction label="Copy list" icon={Copy} onClick={onCopyToClipboard} />}
      {onRefreshFromJira && (
        <IconAction label={isRefreshing ? "Syncing..." : "Refresh from Jira"} icon={RefreshCw} busy={isRefreshing} onClick={onRefreshFromJira} />
      )}

      <div className="flex-1" />

      <BarDivider />

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="shrink-0 border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-transparent"
      >
        Clear
      </Button>
    </BarContainer>
  );
}
