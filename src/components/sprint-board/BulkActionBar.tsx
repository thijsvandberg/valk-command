"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import useSWR from "swr";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import { swrFetcher } from "@/lib/api-client";
import { Search } from "lucide-react";
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
// Sub-panel: Epic picker
// ---------------------------------------------------------------------------

interface EpicListItem {
  key: string;
  name: string;
  status: string;
}

function EpicSubPanel({ onSelect }: { onSelect: (epicKey: string | null, epicName: string | null) => void }) {
  const { data } = useSWR<EpicListItem[]>("/api/epics", swrFetcher);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter((e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-[var(--color-surface-base)] px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search epics..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(null, null)}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
      >
        No epic
      </button>
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((epic) => (
          <button
            key={epic.key}
            type="button"
            onClick={() => onSelect(epic.key, epic.name)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className="truncate">{epic.name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-text-muted">{epic.key}</span>
          </button>
        ))}
        {!data && <div className="px-3 py-2 text-body-sm text-text-tertiary">Loading...</div>}
        {data && filtered.length === 0 && <div className="px-3 py-2 text-body-sm text-text-tertiary">No epics found</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Assignee picker
// ---------------------------------------------------------------------------

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}

function AssigneeSubPanel({ onSelect }: { onSelect: (accountId: string | null, name: string | null) => void }) {
  const { data } = useSWR<{ users: AssignableUser[] }>("/api/jira/assignable-users", swrFetcher);
  const [query, setQuery] = useState("");
  const users = data?.users ?? [];
  const filtered = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter((u) => u.displayName.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-[var(--color-surface-base)] px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(null, null)}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
      >
        Unassigned
      </button>
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((user) => (
          <button
            key={user.accountId}
            type="button"
            onClick={() => onSelect(user.accountId, user.displayName)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            {user.displayName}
          </button>
        ))}
        {!data && <div className="px-3 py-2 text-body-sm text-text-tertiary">Loading...</div>}
        {data && filtered.length === 0 && <div className="px-3 py-2 text-body-sm text-text-tertiary">No users found</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panel: Label picker (multi-select toggle)
// ---------------------------------------------------------------------------

function LabelSubPanel({ onSelect }: { onSelect: (labels: string[]) => void }) {
  const { data } = useSWR<{ labels: string[] }>("/api/jira/labels", swrFetcher);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allLabels = data?.labels ?? [];
  const filtered = useMemo(() => {
    if (!query) return allLabels;
    const q = query.toLowerCase();
    return allLabels.filter((l) => l.toLowerCase().includes(q));
  }, [allLabels, query]);

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-[var(--color-surface-base)] px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search labels..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => toggle(label)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${selected.has(label) ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20" : "border-border-default"}`}>
              {selected.has(label) && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {label}
          </button>
        ))}
        {!data && <div className="px-3 py-2 text-body-sm text-text-tertiary">Loading...</div>}
        {data && filtered.length === 0 && <div className="px-3 py-2 text-body-sm text-text-tertiary">No labels found</div>}
      </div>
      {selected.size > 0 && (
        <>
          <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
          <button
            type="button"
            onClick={() => onSelect([...selected])}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-hover-list-item"
          >
            Apply to {selected.size} label{selected.size === 1 ? "" : "s"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update dropdown (Set Status, Set Readiness, Set Epic, Move to Sprint,
//                  Update Assignee, Add/Update Label)
// ---------------------------------------------------------------------------

type UpdateSubView = "menu" | "status" | "readiness" | "sprint" | "epic" | "assignee" | "label";

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
  onSetEpic?: (epicKey: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null) => void;
  onUpdateLabel?: (labels: string[]) => void;
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
                <MenuItem onClick={() => setSubView("epic")}>Set Epic</MenuItem>
              )}
              {onMoveSprint && sprints && (
                <MenuItem onClick={() => setSubView("sprint")}>Move to Sprint</MenuItem>
              )}
              {onUpdateAssignee && (
                <MenuItem onClick={() => setSubView("assignee")}>Update Assignee</MenuItem>
              )}
              {onUpdateLabel && (
                <MenuItem onClick={() => setSubView("label")}>Add/Update Label</MenuItem>
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

          {subView === "epic" && (
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
              <EpicSubPanel onSelect={(key) => { onSetEpic?.(key); close(); }} />
            </>
          )}

          {subView === "assignee" && (
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
              <AssigneeSubPanel onSelect={(accountId, name) => { onUpdateAssignee?.(accountId, name); close(); }} />
            </>
          )}

          {subView === "label" && (
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
              <LabelSubPanel onSelect={(labels) => { onUpdateLabel?.(labels); close(); }} />
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
  onSetEpic?: (epicKey: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null) => void;
  onUpdateLabel?: (labels: string[]) => void;
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
    <BarContainer borderPosition="top" className="sticky bottom-0 z-40 gap-2 bg-[var(--color-surface-base)] sm:gap-3">
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
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
            <span className="font-semibold text-text-primary">{selectedPoints}</span>
            <span className="text-[9px] uppercase text-text-muted tracking-wide font-medium">SP</span>
          </span>
        )}
        {selectedBV !== undefined && selectedBV > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
            <span className="font-semibold text-text-primary">{selectedBV}</span>
            <span className="text-[9px] uppercase text-text-muted tracking-wide font-medium">BV</span>
          </span>
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
