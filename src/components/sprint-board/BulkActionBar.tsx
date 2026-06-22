"use client";

import { useState, useRef } from "react";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Button } from "@/components/ui/Button";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Checkbox } from "@/components/shared/Checkbox";
import {
  Copy,
  Loader2,
  Boxes,
  ChevronDown,
  Sparkles,
  Settings2,
  RefreshCw,
  Check,
} from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { AnchoredMenu, MenuItem, TicketActionMenuContent, type FlagState } from "@/components/sprint-board/ticket-action-menu";
import type { QuickMoveOption } from "@/lib/quick-moves";

// ---------------------------------------------------------------------------
// Update dropdown (Set Status, Set Readiness, Set Epic, Move to Sprint,
//                  Update Assignee, Add/Update Label, Flag/Remove flag)
// ---------------------------------------------------------------------------

function UpdateDropdown({
  onSetStatus,
  onSetReadiness,
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
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: (epicKey: string | null, epicName: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
  quickMoves?: QuickMoveOption[];
  onQuickMove?: (opt: QuickMoveOption) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null) => void;
  onUpdateLabel?: (labels: string[], mode: "add" | "set") => void;
  onSetFlagged?: (flagged: boolean) => void;
  flagState?: FlagState;
  sprints?: Sprint[];
  pinnedSprintIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick([ref, menuRef], () => setOpen(false), { enabled: open });

  const hasAnyAction = onSetStatus || onSetReadiness || onSetEpic || onMoveSprint || (onQuickMove && quickMoves && quickMoves.length > 0) || onUpdateAssignee || onUpdateLabel || onSetFlagged;
  if (!hasAnyAction) return null;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="border-0 text-text-secondary hover:text-text-primary"
      >
        <Settings2 className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="hidden sm:inline">Update</span>
        <ChevronDown className="ml-1 h-3 w-3 shrink-0" strokeWidth={1.5} />
      </Button>

      {open && (
        <AnchoredMenu anchorRef={ref} menuRef={menuRef} width="w-[320px]">
          <TicketActionMenuContent
            onSetStatus={onSetStatus}
            onSetReadiness={onSetReadiness}
            onSetEpic={onSetEpic}
            epicClearable
            onMoveSprint={onMoveSprint}
            quickMoves={quickMoves}
            onQuickMove={onQuickMove}
            onUpdateAssignee={onUpdateAssignee}
            onUpdateLabel={onUpdateLabel}
            onSetFlagged={onSetFlagged}
            flagState={flagState}
            sprints={sprints}
            pinnedSprintIds={pinnedSprintIds}
            close={() => setOpen(false)}
          />
        </AnchoredMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Assist dropdown (Review Story, Generate Subtasks, Summarized List)
// ---------------------------------------------------------------------------

function AiAssistDropdown({
  onReviewStory,
  onGenerateSubtasks,
  onSummarizedList,
  isExporting,
  isGeneratingSubtasks,
}: {
  onReviewStory?: () => void;
  onGenerateSubtasks?: () => void;
  onSummarizedList?: () => void;
  isExporting?: boolean;
  isGeneratingSubtasks?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick([ref, menuRef], () => setOpen(false), { enabled: open });

  const hasAnyAction = onReviewStory || onGenerateSubtasks || onSummarizedList;
  if (!hasAnyAction) return null;

  const isBusy = isExporting || isGeneratingSubtasks;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        onClick={() => setOpen(!open)}
        className="border-0 text-text-secondary hover:text-text-primary"
      >
        {isBusy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={1.5} />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        )}
        <span className="hidden sm:inline">AI Assist</span>
        <ChevronDown className="ml-1 h-3 w-3 shrink-0" strokeWidth={1.5} />
      </Button>

      {open && (
        <AnchoredMenu anchorRef={ref} menuRef={menuRef} width="w-52">
          {onReviewStory && (
            <MenuItem onClick={() => { onReviewStory(); setOpen(false); }}>
              Review Story
            </MenuItem>
          )}
          {onGenerateSubtasks && (
            <MenuItem
              onClick={() => { onGenerateSubtasks(); setOpen(false); }}
              disabled={isGeneratingSubtasks}
            >
              {isGeneratingSubtasks ? "Generating..." : "Generate Subtasks"}
            </MenuItem>
          )}
          {onSummarizedList && (
            <MenuItem
              onClick={() => { onSummarizedList(); setOpen(false); }}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                  Generating...
                </>
              ) : (
                "Summarized List"
              )}
            </MenuItem>
          )}
        </AnchoredMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BulkActionBar
// ---------------------------------------------------------------------------

export function BulkActionBar({
  count,
  selectedPoints,
  selectedBV,
  allChecked,
  totalCount,
  onToggleAll,
  onClear,
  // Inbox-specific prominent primary action (BRDG-373); inert elsewhere.
  onMarkRead,
  markReadCount,
  // Update dropdown actions
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
  // AI Assist dropdown actions
  onReviewStory,
  onGenerateSubtasks,
  onExportForStakeholders,
  isExporting,
  isGeneratingSubtasks,
  // Standalone actions
  onRefreshFromJira,
  onCopyToClipboard,
  onRefine,
  isRefreshing,
  floating,
}: {
  count: number;
  selectedPoints?: number;
  selectedBV?: number;
  allChecked?: boolean;
  totalCount?: number;
  onToggleAll?: () => void;
  onClear: () => void;
  /**
   * Inbox "Mark as read" (BRDG-373): when provided, a prominent leading primary
   * button is rendered before the Update dropdown. The board / epic children omit
   * it, so their bar renders unchanged.
   */
  onMarkRead?: () => void;
  markReadCount?: number;
  // Update dropdown
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetStatus?: (status: JiraStatus) => void;
  onSetEpic?: (epicKey: string | null, epicName: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
  /** One-click move destinations shown above "Move to Sprint" (BRDG-369). */
  quickMoves?: QuickMoveOption[];
  onQuickMove?: (opt: QuickMoveOption) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null) => void;
  onUpdateLabel?: (labels: string[], mode: "add" | "set") => void;
  onSetFlagged?: (flagged: boolean) => void;
  flagState?: FlagState;
  sprints?: Sprint[];
  /** Pinned (slot) sprint IDs, in pinned order; shown first in the Move to Sprint list. */
  pinnedSprintIds?: string[];
  // AI Assist dropdown
  onReviewStory?: () => void;
  onGenerateSubtasks?: () => void;
  onExportForStakeholders?: () => void;
  isExporting?: boolean;
  isGeneratingSubtasks?: boolean;
  // Standalone
  onRefreshFromJira?: () => void;
  onCopyToClipboard?: () => void;
  onRefine?: () => void;
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
  return (
    <BarContainer
      border={!floating}
      borderPosition="top"
      className={
        floating
          ? "bulk-bar-enter sticky bottom-3 z-50 -mx-3 mt-3 gap-2 rounded-xl border border-border-default bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)] sm:-mx-4 sm:gap-3"
          : "bulk-bar-enter sticky bottom-0 z-50 gap-2 bg-[var(--color-surface-base)] sm:gap-3"
      }
    >
      {/* Select all / deselect all checkbox */}
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="flex shrink-0 items-center justify-center cursor-pointer"
          title={allChecked ? "Deselect all" : "Select all"}
        >
          <Checkbox checked={!!allChecked} indeterminate={!allChecked} />
        </button>
      )}

      {/* Selection counter with SP and BV badges */}
      <span className="shrink-0 flex items-center gap-2 text-body-sm font-medium text-text-secondary whitespace-nowrap tabular-nums">
        <span>{count}{totalCount ? `/${totalCount}` : ""} selected</span>
        {selectedPoints !== undefined && selectedPoints > 0 && (
          <MetricBadge metric="sp" value={selectedPoints} tinted />
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

      {/* Update dropdown */}
      <UpdateDropdown
        onSetStatus={onSetStatus}
        onSetReadiness={onSetReadiness}
        onSetEpic={onSetEpic}
        onMoveSprint={onMoveSprint}
        quickMoves={quickMoves}
        onQuickMove={onQuickMove}
        onUpdateAssignee={onUpdateAssignee}
        onUpdateLabel={onUpdateLabel}
        onSetFlagged={onSetFlagged}
        flagState={flagState}
        sprints={sprints}
        pinnedSprintIds={pinnedSprintIds}
      />

      {/* AI Assist dropdown */}
      <AiAssistDropdown
        onReviewStory={onReviewStory}
        onGenerateSubtasks={onGenerateSubtasks}
        onSummarizedList={onExportForStakeholders}
        isExporting={isExporting}
        isGeneratingSubtasks={isGeneratingSubtasks}
      />

      <BarDivider />

      {/* Standalone: Copy List */}
      {onCopyToClipboard && (
        <Button
          variant="ghost"
          size="md"
          onClick={onCopyToClipboard}
          className="shrink-0 border-0 text-text-secondary hover:text-text-primary"
        >
          <Copy className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="hidden sm:inline">Copy List</span>
        </Button>
      )}

      {/* Standalone: Refresh from Jira */}
      {onRefreshFromJira && (
        <Button
          variant="ghost"
          size="md"
          disabled={isRefreshing}
          onClick={onRefreshFromJira}
          className="shrink-0 border-0 text-text-secondary hover:text-text-primary"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
          <span className="hidden sm:inline">{isRefreshing ? "Syncing..." : "Refresh from Jira"}</span>
        </Button>
      )}

      <div className="flex-1" />

      {/* Standalone: Add to Refinement */}
      {onRefine && (
        <Button
          variant="ghost"
          size="md"
          onClick={onRefine}
          className="shrink-0 border-0 text-text-secondary hover:text-text-primary"
        >
          <Boxes className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="hidden sm:inline">Add to Refinement</span>
        </Button>
      )}

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
