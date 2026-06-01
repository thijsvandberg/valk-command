"use client";

import { useState, useRef } from "react";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Button } from "@/components/ui/Button";
import { MetricBadge } from "@/components/shared/MetricBadge";
import {
  Copy,
  Loader2,
  Gem,
  ChevronDown,
  Sparkles,
  Settings2,
  RefreshCw,
} from "lucide-react";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { AnchoredMenu, MenuItem, TicketActionMenuContent, type FlagState } from "@/components/sprint-board/ticket-action-menu";

// ---------------------------------------------------------------------------
// Update dropdown (Set Status, Set Readiness, Set Epic, Move to Sprint,
//                  Update Assignee, Add/Update Label, Flag/Remove flag)
// ---------------------------------------------------------------------------

function UpdateDropdown({
  onSetStatus,
  onSetReadiness,
  onSetEpic,
  onMoveSprint,
  onUpdateAssignee,
  onUpdateLabel,
  onSetFlagged,
  flagState,
  sprints,
  pinnedSprintIds,
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: (epicKey: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
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

  const hasAnyAction = onSetStatus || onSetReadiness || onSetEpic || onMoveSprint || onUpdateAssignee || onUpdateLabel || onSetFlagged;
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
        <AnchoredMenu anchorRef={ref} menuRef={menuRef} width="w-56">
          <TicketActionMenuContent
            onSetStatus={onSetStatus}
            onSetReadiness={onSetReadiness}
            onSetEpic={onSetEpic}
            onMoveSprint={onMoveSprint}
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

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        onClick={() => setOpen(!open)}
        className="border-0 text-text-secondary hover:text-text-primary"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
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
  // Update dropdown actions
  onSetReadiness,
  onSetStatus,
  onSetEpic,
  onMoveSprint,
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
}: {
  count: number;
  selectedPoints?: number;
  selectedBV?: number;
  allChecked?: boolean;
  totalCount?: number;
  onToggleAll?: () => void;
  onClear: () => void;
  // Update dropdown
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetStatus?: (status: JiraStatus) => void;
  onSetEpic?: (epicKey: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
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
}) {
  return (
    <BarContainer borderPosition="top" className="sticky bottom-0 z-50 gap-2 bg-[var(--color-surface-base)] sm:gap-3">
      {/* Select all / deselect all checkbox */}
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="flex shrink-0 items-center justify-center cursor-pointer"
          title={allChecked ? "Deselect all" : "Select all"}
        >
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
              allChecked
                ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                : "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
            }`}
          >
            {allChecked ? (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="h-1.5 w-1.5 rounded-sm bg-[var(--color-brand-400)]" />
            )}
          </span>
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

      {/* Update dropdown */}
      <UpdateDropdown
        onSetStatus={onSetStatus}
        onSetReadiness={onSetReadiness}
        onSetEpic={onSetEpic}
        onMoveSprint={onMoveSprint}
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
          <Gem className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
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
