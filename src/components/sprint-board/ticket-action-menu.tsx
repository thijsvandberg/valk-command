"use client";

import { useState, useRef, useMemo, useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import type { QuickMoveOption } from "@/lib/quick-moves";
import { swrFetcher } from "@/lib/api-client";
import { Search, Flag, ArrowLeft } from "lucide-react";
import {
  READINESS_OPTIONS,
  READINESS_CONFIG,
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
} from "@/types/ticket";
import { ReadinessIcon } from "@/components/shared/ReadinessCell";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Card } from "@/components/shared/Card";
import { Checkbox } from "@/components/shared/Checkbox";

// ---------------------------------------------------------------------------
// Anchored portal menu
// ---------------------------------------------------------------------------

/**
 * Renders dropdown content in a portal on document.body so it escapes the
 * `<main>` stacking context (which sits below the z-30 view-header portal) and
 * can paint over the header. Flips above/below the anchor based on free space.
 */
export function AnchoredMenu({
  anchorRef,
  menuRef,
  width,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  width: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const spaceAbove = r.top;
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceAbove >= spaceBelow;
      setPos({
        left: r.left,
        ...(flipUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        maxHeight: (flipUp ? spaceAbove : spaceBelow) - 16,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  if (!pos) return null;
  return createPortal(
    <div ref={menuRef} className="fixed z-[9999]" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
      <Card variant="floating" className={`${width} overflow-y-auto py-1`} style={{ maxHeight: pos.maxHeight }}>
        {children}
      </Card>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Cursor-positioned portal menu (for right-click context menus)
// ---------------------------------------------------------------------------

/**
 * Renders menu content in a portal at a fixed cursor position. Clamps within
 * the viewport, flipping left/up when the menu would overflow the right/bottom
 * edge. Closes on outside mousedown and Escape. Same floating-card styling as
 * AnchoredMenu so both menu surfaces look identical.
 */
export function CursorMenu({
  x,
  y,
  width = "w-60",
  onClose,
  children,
}: {
  x: number;
  y: number;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useOutsideClick(ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const left = x + rect.width + margin > window.innerWidth ? Math.max(margin, x - rect.width) : x;
      const spaceBelow = window.innerHeight - y;
      const flipUp = rect.height + margin > spaceBelow && y > spaceBelow;
      const top = flipUp ? Math.max(margin, y - rect.height) : y;
      const maxHeight = (flipUp ? y : spaceBelow) - margin * 2;
      setPos({ left, top, maxHeight });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [x, y]);

  // Render at the raw cursor point first (invisible) so the effect can measure
  // the menu's own size, then reposition with viewport clamping/flip applied.
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999]"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }}
    >
      <Card variant="floating" className={`${width} overflow-y-auto py-1`} style={{ maxHeight: pos?.maxHeight }}>
        {children}
      </Card>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu item
// ---------------------------------------------------------------------------

export function MenuItem({
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
        Back
      </button>
      <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
    </>
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
  pinnedSprintIds,
  onSelect,
}: {
  sprints: Sprint[];
  pinnedSprintIds?: string[];
  onSelect: (sprintId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => {
    const eligible = sprints.filter((s) => s.state === "active" || s.state === "future");
    const pinnedOrder = pinnedSprintIds ?? [];
    // Show pinned (slot) sprints first, in pinned order, then the rest.
    const byPinned = [...eligible].sort((a, b) => {
      const ai = pinnedOrder.indexOf(a.id);
      const bi = pinnedOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
    if (!query) return byPinned;
    const q = query.toLowerCase();
    return byPinned.filter((s) => s.name.toLowerCase().includes(q));
  }, [sprints, pinnedSprintIds, query]);

  const showBacklog = !query || "backlog".includes(query.toLowerCase());
  // Divider only when not searching, since the pinned/rest split is meaningless once filtered.
  const lastPinnedIdx = query ? -1 : sorted.reduce((acc, s, i) => ((pinnedSprintIds ?? []).includes(s.id) ? i : acc), -1);

  return (
    <div className="py-1">
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-border-default bg-[var(--color-surface-base)] px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sprints..."
            className="w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[240px] overflow-y-auto">
        {showBacklog && (
          <button
            type="button"
            onClick={() => onSelect("__backlog__")}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            Backlog
          </button>
        )}
        {sorted.map((s, i) => (
          <div key={s.id}>
            <button
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
            {lastPinnedIdx >= 0 && i === lastPinnedIdx && i < sorted.length - 1 && (
              <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
            )}
          </div>
        ))}
        {sorted.length === 0 && !showBacklog && (
          <div className="px-3 py-2 text-body-sm text-text-tertiary">No sprints found</div>
        )}
        {sorted.length === 0 && !query && (
          <div className="px-3 py-2 text-body-sm text-text-tertiary">No sprints available</div>
        )}
      </div>
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
  const users = useMemo(() => data?.users ?? [], [data?.users]);
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

function LabelSubPanel({ onSelect }: { onSelect: (labels: string[], mode: "add" | "set") => void }) {
  const { data } = useSWR<{ labels: string[] }>("/api/jira/labels", swrFetcher);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allLabels = useMemo(() => data?.labels ?? [], [data?.labels]);
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
            <Checkbox checked={selected.has(label)} />
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
            onClick={() => onSelect([...selected], "add")}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-hover-list-item"
          >
            Add {selected.size} label{selected.size === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            onClick={() => onSelect([...selected], "set")}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item"
          >
            Replace all labels
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared menu content: the Update sub-view state machine plus optional
// direct-action items (flag, AI assist, refine). Rendered both inside the
// toolbar's anchored Update dropdown and the row right-click context menu.
// Each item only renders when its corresponding callback is supplied.
// ---------------------------------------------------------------------------

type UpdateSubView = "menu" | "status" | "readiness" | "sprint" | "epic" | "assignee" | "label";

/** Aggregate flag state of the targeted tickets, used to pick which flag item to show. */
export type FlagState = "flagged" | "unflagged" | "mixed";

export function TicketActionMenuContent({
  onSetStatus,
  onSetReadiness,
  onSetEpic,
  onMoveSprint,
  onMoveToTop,
  onMoveToBottom,
  quickMoves,
  onQuickMove,
  onUpdateAssignee,
  onUpdateLabel,
  onSetFlagged,
  flagState,
  onReviewStory,
  onGenerateSubtasks,
  onRefine,
  sprints,
  pinnedSprintIds,
  close,
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: (epicKey: string | null) => void;
  onMoveSprint?: (sprintId: string) => void;
  /** Rank the target(s) to the top/bottom of the current sprint (whole sprint). */
  onMoveToTop?: () => void;
  onMoveToBottom?: () => void;
  /** One-click move destinations shown above "Move to Sprint" (BRDG-369). */
  quickMoves?: QuickMoveOption[];
  onQuickMove?: (opt: QuickMoveOption) => void;
  onUpdateAssignee?: (accountId: string | null, name: string | null) => void;
  onUpdateLabel?: (labels: string[], mode: "add" | "set") => void;
  /** When supplied, renders Flag / Remove flag items. `true` flags, `false` unflags. */
  onSetFlagged?: (flagged: boolean) => void;
  flagState?: FlagState;
  onReviewStory?: () => void;
  onGenerateSubtasks?: () => void;
  onRefine?: () => void;
  sprints?: Sprint[];
  pinnedSprintIds?: string[];
  close: () => void;
}) {
  const [subView, setSubView] = useState<UpdateSubView>("menu");

  const hasQuickMoves = Boolean(onQuickMove && quickMoves && quickMoves.length > 0);
  const hasUpdateAction = onSetStatus || onSetReadiness || onSetEpic || hasQuickMoves || onMoveSprint || onMoveToTop || onMoveToBottom || onUpdateAssignee || onUpdateLabel;
  const hasAiAction = onReviewStory || onGenerateSubtasks || onRefine;
  // The "Move to …" actions form their own group, fenced by dividers from the
  // set-* items above and the assignee/label items below.
  const hasSetAction = onSetStatus || onSetReadiness || onSetEpic;
  const hasMoveAction = hasQuickMoves || (onMoveSprint && sprints) || onMoveToTop || onMoveToBottom;
  const hasOtherUpdate = onUpdateAssignee || onUpdateLabel;
  const showFlag = Boolean(onSetFlagged);
  const showFlagItem = flagState !== "flagged"; // show "Flag" unless every target is already flagged
  const showUnflagItem = flagState !== "unflagged"; // show "Remove flag" unless every target is unflagged

  if (subView === "menu") {
    return (
      <>
        {onSetStatus && <MenuItem onClick={() => setSubView("status")}>Set Status</MenuItem>}
        {onSetReadiness && <MenuItem onClick={() => setSubView("readiness")}>Set Readiness</MenuItem>}
        {onSetEpic && <MenuItem onClick={() => setSubView("epic")}>Set Epic</MenuItem>}
        {hasSetAction && hasMoveAction && <div className="mx-2 my-1 h-px bg-overlay-strong" />}
        {hasQuickMoves && quickMoves!.map((opt) => (
          <MenuItem key={opt.id} onClick={() => { onQuickMove!(opt); close(); }}>
            <span className="flex items-center gap-1.5">
              {opt.label}
              {opt.badge && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-400)]">{opt.badge}</span>
              )}
            </span>
          </MenuItem>
        ))}
        {hasQuickMoves && ((onMoveSprint && sprints) || onMoveToTop || onMoveToBottom) && <div className="mx-2 my-1 h-px bg-overlay-strong" />}
        {onMoveSprint && sprints && <MenuItem onClick={() => setSubView("sprint")}>Move to Sprint</MenuItem>}
        {onMoveToTop && <MenuItem onClick={() => { onMoveToTop(); close(); }}>Move to top</MenuItem>}
        {onMoveToBottom && <MenuItem onClick={() => { onMoveToBottom(); close(); }}>Move to bottom</MenuItem>}
        {hasMoveAction && hasOtherUpdate && <div className="mx-2 my-1 h-px bg-overlay-strong" />}
        {onUpdateAssignee && <MenuItem onClick={() => setSubView("assignee")}>Update Assignee</MenuItem>}
        {onUpdateLabel && <MenuItem onClick={() => setSubView("label")}>Add/Update Label</MenuItem>}

        {showFlag && hasUpdateAction && <div className="mx-2 my-1 h-px bg-overlay-strong" />}
        {showFlag && showFlagItem && (
          <MenuItem
            icon={<Flag className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={() => { onSetFlagged?.(true); close(); }}
          >
            Flag
          </MenuItem>
        )}
        {showFlag && showUnflagItem && (
          <MenuItem
            icon={<Flag className="h-3.5 w-3.5 text-[var(--color-status-error)]" fill="var(--color-status-error)" strokeWidth={0} />}
            onClick={() => { onSetFlagged?.(false); close(); }}
          >
            Remove flag
          </MenuItem>
        )}

        {hasAiAction && (hasUpdateAction || showFlag) && <div className="mx-2 my-1 h-px bg-overlay-strong" />}
        {onReviewStory && <MenuItem onClick={() => { onReviewStory(); close(); }}>Review Story</MenuItem>}
        {onGenerateSubtasks && <MenuItem onClick={() => { onGenerateSubtasks(); close(); }}>Generate Subtasks</MenuItem>}
        {onRefine && <MenuItem onClick={() => { onRefine(); close(); }}>Add to Refinement</MenuItem>}
      </>
    );
  }

  return (
    <>
      <BackButton onClick={() => setSubView("menu")} />
      {subView === "status" && <StatusSubPanel onSelect={(s) => { onSetStatus?.(s); close(); }} />}
      {subView === "readiness" && <ReadinessSubPanel onSelect={(r) => { onSetReadiness?.(r); close(); }} />}
      {subView === "sprint" && sprints && (
        <SprintSubPanel sprints={sprints} pinnedSprintIds={pinnedSprintIds} onSelect={(id) => { onMoveSprint?.(id); close(); }} />
      )}
      {subView === "epic" && <EpicSubPanel onSelect={(key) => { onSetEpic?.(key); close(); }} />}
      {subView === "assignee" && <AssigneeSubPanel onSelect={(accountId, name) => { onUpdateAssignee?.(accountId, name); close(); }} />}
      {subView === "label" && <LabelSubPanel onSelect={(labels, mode) => { onUpdateLabel?.(labels, mode); close(); }} />}
    </>
  );
}
