"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import {
  READINESS_OPTIONS,
  READINESS_CONFIG,
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
} from "@/types/ticket";
import { ReadinessIcon } from "@/components/shared/ReadinessCell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import {
  Copy,
  Loader2,
  Gem,
  ChevronDown,
  Sparkles,
  Settings2,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";

// ---------------------------------------------------------------------------
// Shared click-outside hook
// ---------------------------------------------------------------------------

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, ref, onClose]);
}

// ---------------------------------------------------------------------------
// Dropdown menu item
// ---------------------------------------------------------------------------

function MenuItem({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon && <span className="shrink-0 h-4 w-4 flex items-center justify-center text-text-tertiary">{icon}</span>}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Status picker
// ---------------------------------------------------------------------------

const JIRA_STATUS_ORDER: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

function StatusSubPanel({ onSelect }: { onSelect: (status: JiraStatus) => void }) {
  return (
    <div className="py-1">
      {JIRA_STATUS_ORDER.map((status) => {
        const colors = JIRA_STATUS_COLORS[status];
        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(status)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {JIRA_STATUS_ABBREVIATIONS[status]}
            </span>
            <span className="text-text-secondary">{status}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Readiness picker
// ---------------------------------------------------------------------------

function ReadinessSubPanel({ onSelect }: { onSelect: (readiness: TicketReadiness | null) => void }) {
  return (
    <div className="py-1">
      {READINESS_OPTIONS.map((opt) => {
        const cfg = opt.value ? READINESS_CONFIG[opt.value] : null;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(opt.value)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span
              className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full"
              style={{
                color: cfg?.color ?? "var(--color-text-muted)",
                backgroundColor: cfg?.bg ?? "var(--color-overlay-default)",
              }}
            >
              {opt.value && <ReadinessIcon value={opt.value} size={10} />}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Sprint picker
// ---------------------------------------------------------------------------

function SprintSubPanel({
  sprints,
  onSelect,
}: {
  sprints: Sprint[];
  onSelect: (sprintId: string) => void;
}) {
  const eligible = sprints.filter((s) => s.state === "active" || s.state === "future");
  return (
    <div className="py-1 max-h-[240px] overflow-y-auto">
      <button
        type="button"
        onClick={() => onSelect("__backlog__")}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
      >
        Backlog
      </button>
      {eligible.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
        >
          {s.name}
          {s.state === "active" && (
            <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]">
              Active
            </span>
          )}
        </button>
      ))}
      {eligible.length === 0 && (
        <div className="px-3 py-2 text-body-sm text-text-tertiary">No sprints available</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update dropdown (Set Status, Set Readiness, Set Epic, Move to Sprint,
//                  Update Assignee, Add/Update Label)
// ---------------------------------------------------------------------------

type UpdateSubView = "menu" | "status" | "readiness" | "sprint";

function UpdateDropdown({
  onSetStatus,
  onSetReadiness,
  onSetEpic,
  onMoveSprint,
  onUpdateAssignee,
  onUpdateLabel,
  sprints,
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: () => void;
  onMoveSprint?: (sprintId: string) => void;
  onUpdateAssignee?: () => void;
  onUpdateLabel?: () => void;
  sprints?: Sprint[];
}) {
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState<UpdateSubView>("menu");
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => { setOpen(false); setSubView("menu"); });

  const close = () => { setOpen(false); setSubView("menu"); };

  const hasAnyAction = onSetStatus || onSetReadiness || onSetEpic || onMoveSprint || onUpdateAssignee || onUpdateLabel;
  if (!hasAnyAction) return null;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        onClick={() => { if (open) { close(); } else { setOpen(true); } }}
        className="border-0 text-text-secondary hover:text-text-primary"
      >
        <Settings2 className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="hidden sm:inline">Update</span>
        <ChevronDown className="ml-1 h-3 w-3 shrink-0" strokeWidth={1.5} />
      </Button>

      {open && (
        <Card variant="floating" className="absolute bottom-full left-0 z-50 mb-1 w-56 py-1">
          {subView === "menu" && (
            <>
              {onSetStatus && (
                <MenuItem onClick={() => setSubView("status")}>Set Status</MenuItem>
              )}
              {onSetReadiness && (
                <MenuItem onClick={() => setSubView("readiness")}>Set Readiness</MenuItem>
              )}
              {onSetEpic && (
                <MenuItem onClick={() => { onSetEpic(); close(); }}>Set Epic</MenuItem>
              )}
              {onMoveSprint && sprints && (
                <MenuItem onClick={() => setSubView("sprint")}>Move to Sprint</MenuItem>
              )}
              {onUpdateAssignee && (
                <MenuItem onClick={() => { onUpdateAssignee(); close(); }}>Update Assignee</MenuItem>
              )}
              {onUpdateLabel && (
                <MenuItem onClick={() => { onUpdateLabel(); close(); }}>Add/Update Label</MenuItem>
              )}
            </>
          )}

          {subView === "status" && (
            <>
              <button
                type="button"
                onClick={() => setSubView("menu")}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
                Back
              </button>
              <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
              <StatusSubPanel onSelect={(s) => { onSetStatus?.(s); close(); }} />
            </>
          )}

          {subView === "readiness" && (
            <>
              <button
                type="button"
                onClick={() => setSubView("menu")}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
                Back
              </button>
              <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
              <ReadinessSubPanel onSelect={(r) => { onSetReadiness?.(r); close(); }} />
            </>
          )}

          {subView === "sprint" && sprints && (
            <>
              <button
                type="button"
                onClick={() => setSubView("menu")}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
                Back
              </button>
              <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
              <SprintSubPanel sprints={sprints} onSelect={(id) => { onMoveSprint?.(id); close(); }} />
            </>
          )}
        </Card>
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

  useClickOutside(ref, open, () => setOpen(false));

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
        <Card variant="floating" className="absolute bottom-full left-0 z-50 mb-1 w-52 py-1">
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
        </Card>
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
  sprints,
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
  onSetEpic?: () => void;
  onMoveSprint?: (sprintId: string) => void;
  onUpdateAssignee?: () => void;
  onUpdateLabel?: () => void;
  sprints?: Sprint[];
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
    <BarContainer borderPosition="top" className="sticky bottom-0 z-20 gap-2 overflow-x-auto bg-[var(--color-surface-base)] sm:gap-3">
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

      {/* Selection counter with SP and BV */}
      <span className="shrink-0 text-body-sm font-medium text-text-secondary whitespace-nowrap">
        {count}{totalCount ? `/${totalCount}` : ""} selected
        {selectedPoints !== undefined && selectedPoints > 0 && (
          <span className="ml-1 text-text-tertiary">&middot; {selectedPoints} SP</span>
        )}
        {selectedBV !== undefined && selectedBV > 0 && (
          <span className="ml-1 text-text-tertiary">&middot; {selectedBV} BV</span>
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
        sprints={sprints}
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
