"use client";

import { Fragment, useState, useRef, useMemo, useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import type { QuickMoveOption } from "@/lib/quick-moves";
import { swrFetcher } from "@/lib/api-client";
import { Search, Flag, ArrowDownToLine, ArrowUpToLine, Boxes, Check, ChevronRight, FilePen, Sparkles } from "lucide-react";
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
import { EpicPickerBody, type EpicOption } from "@/components/shared/EpicPicker";

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
      <Card variant="floating" className={`${width} overflow-visible py-1`} style={{ maxHeight: pos.maxHeight }}>
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
  width = "w-[320px]",
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
      <Card variant="floating" className={`${width} overflow-visible py-1`} style={{ maxHeight: pos?.maxHeight }}>
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

// Floating-card styling shared by the hover flyouts and the menu surfaces.
const FLYOUT_PANEL = "rounded-xl border border-border-default bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)]";

/**
 * A menu row whose sub-content opens to the SIDE on hover (BRDG-374), matching the
 * /dev/exploration prototype - no click, no Back. Nesting works because
 * `group-hover/fly` targets the nearest `group/fly` ancestor and hovering any
 * descendant keeps every ancestor hovered; the `pl-1` gap bridges trigger -> panel.
 */
function Flyout({ icon, label, width = "w-[240px]", children }: { icon?: ReactNode; label: ReactNode; width?: string; children: ReactNode }) {
  return (
    <div className="group/fly relative">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item group-hover/fly:bg-hover-list-item"
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary">{icon}</span>}
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
      </button>
      <div className="invisible absolute left-full top-0 z-20 pl-1 opacity-0 transition-opacity duration-100 group-hover/fly:visible group-hover/fly:opacity-100">
        <div className={`${FLYOUT_PANEL} ${width} max-h-[min(70vh,440px)] overflow-y-auto py-1`}>{children}</div>
      </div>
    </div>
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

// The root "menu" is the full right-click menu; "update"/"move"/"flag"/"assist" are the
// group views the bar opens directly via `initialView`. Deeper pickers are hover flyouts.
type MenuView = "menu" | "update" | "move" | "flag" | "assist";

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
  onMarkRead,
  epicValue,
  epicSuggestTicketKey,
  epicClearable,
  sprints,
  pinnedSprintIds,
  initialView = "menu",
  close,
}: {
  onSetStatus?: (status: JiraStatus) => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onSetEpic?: (epicKey: string | null, epicName: string | null) => void;
  /** The single target's current epic, so the Set Epic panel shows the checkmark
   *  + View/Unlink actions exactly like the sidebar (null for multi-select). */
  epicValue?: EpicOption | null;
  /** When exactly one ticket is targeted, its key enables the AI suggest-epic
   *  action in the Set Epic panel (single-ticket only, like the sidebar). */
  epicSuggestTicketKey?: string;
  /** Multi-select only: show a single "Remove epic" action (no single value to
   *  unlink). Omitted for single-row, which unlinks via its current epic. */
  epicClearable?: boolean;
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
  /** New story inbox (BRDG-373): renders a leading "Mark as read" item. Omitted on
   *  the board / epic children, whose menu is unchanged. */
  onMarkRead?: () => void;
  sprints?: Sprint[];
  pinnedSprintIds?: string[];
  /** Open straight into a group view (used by the bar's per-group icon dropdowns). */
  initialView?: MenuView;
  close: () => void;
}) {
  const hasQuickMoves = Boolean(onQuickMove && quickMoves && quickMoves.length > 0);
  const hasMove = hasQuickMoves || (onMoveSprint && sprints) || onMoveToTop || onMoveToBottom;
  const hasUpdate = onSetStatus || onSetReadiness || onSetEpic || onUpdateAssignee || onUpdateLabel;
  const hasAssist = onReviewStory || onGenerateSubtasks;
  const showFlag = Boolean(onSetFlagged);
  const showFlagItem = flagState !== "flagged"; // show "Flag" unless every target is already flagged
  const showUnflagItem = flagState !== "unflagged"; // show "Remove flag" unless every target is unflagged

  const divider = <div className="mx-2 my-1 h-px bg-overlay-strong" />;

  // Move group (BRDG-374): named quick-moves with a destination chip, the searchable
  // "More sprints" hover flyout, then the rank actions. Shared by the root menu (inline,
  // most-used) and the bar's Move dropdown (initialView="move").
  const moveItems = (
    <>
      {hasQuickMoves &&
        quickMoves!.map((opt) => (
          // Empty icon slot keeps the label left-aligned with the icon-bearing rows.
          <MenuItem key={opt.id} icon={<span className="h-3.5 w-3.5" />} onClick={() => { onQuickMove!(opt); close(); }}>
            {opt.label}
            <span
              className="ml-auto shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-tertiary"
              title={opt.badge}
              aria-label={opt.badge ? `${opt.target} (${opt.badge})` : opt.target}
            >
              {opt.target}
            </span>
          </MenuItem>
        ))}
      {onMoveSprint && sprints && (
        <Flyout icon={<span className="h-3.5 w-3.5" />} label="More sprints" width="w-[260px]">
          <SprintSubPanel sprints={sprints} pinnedSprintIds={pinnedSprintIds} onSelect={(id) => { onMoveSprint?.(id); close(); }} />
        </Flyout>
      )}
      {onMoveToTop && (
        <MenuItem icon={<ArrowUpToLine className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onMoveToTop(); close(); }}>
          Move to top
        </MenuItem>
      )}
      {onMoveToBottom && (
        <MenuItem icon={<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onMoveToBottom(); close(); }}>
          Move to bottom
        </MenuItem>
      )}
    </>
  );

  // Each set-field opens its picker in a hover flyout (no click/Back).
  const updateItems = (
    <>
      {onSetStatus && (
        <Flyout label="Set Status" width="w-[200px]">
          <StatusSubPanel onSelect={(s) => { onSetStatus?.(s); close(); }} />
        </Flyout>
      )}
      {onSetReadiness && (
        <Flyout label="Set Readiness" width="w-[220px]">
          <ReadinessSubPanel onSelect={(r) => { onSetReadiness?.(r); close(); }} />
        </Flyout>
      )}
      {onSetEpic && (
        <Flyout label="Set Epic" width="w-[300px]">
          <EpicPickerBody
            value={epicValue ?? null}
            ticketKey={epicSuggestTicketKey}
            clearable={epicClearable}
            onChange={(epic) => { onSetEpic?.(epic?.key ?? null, epic?.name ?? null); close(); }}
            onClose={close}
          />
        </Flyout>
      )}
      {onUpdateAssignee && (
        <Flyout label="Update Assignee" width="w-[240px]">
          <AssigneeSubPanel onSelect={(accountId, name) => { onUpdateAssignee?.(accountId, name); close(); }} />
        </Flyout>
      )}
      {onUpdateLabel && (
        <Flyout label="Add/Update Label" width="w-[240px]">
          <LabelSubPanel onSelect={(labels, mode) => { onUpdateLabel?.(labels, mode); close(); }} />
        </Flyout>
      )}
    </>
  );

  const flagItems = (
    <>
      {showFlagItem && (
        <MenuItem icon={<Flag className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onSetFlagged?.(true); close(); }}>
          Flag
        </MenuItem>
      )}
      {showUnflagItem && (
        <MenuItem
          icon={<Flag className="h-3.5 w-3.5 text-[var(--color-status-error)]" fill="var(--color-status-error)" strokeWidth={0} />}
          onClick={() => { onSetFlagged?.(false); close(); }}
        >
          Remove flag
        </MenuItem>
      )}
    </>
  );

  const assistItems = (
    <>
      {onReviewStory && <MenuItem onClick={() => { onReviewStory(); close(); }}>Review Story</MenuItem>}
      {onGenerateSubtasks && <MenuItem onClick={() => { onGenerateSubtasks(); close(); }}>Generate Subtasks</MenuItem>}
    </>
  );

  // Bar dropdowns open straight into one group's items (no root menu, no Back).
  if (initialView === "update") return <>{updateItems}</>;
  if (initialView === "move") return <>{moveItems}</>;
  if (initialView === "flag") return <>{flagItems}</>;
  if (initialView === "assist") return <>{assistItems}</>;

  // Root right-click menu, one divider between clusters: Triage · Move · (Flag + Update +
  // Assist) · Refinement. Update and Assist nest as hover flyouts.
  const updateGroup = hasUpdate ? (
    <Flyout icon={<FilePen className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Update" width="w-[220px]">
      {updateItems}
    </Flyout>
  ) : null;
  const assistGroup = hasAssist ? (
    <Flyout icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Assist" width="w-[200px]">
      {assistItems}
    </Flyout>
  ) : null;
  const refineItem = onRefine ? (
    <MenuItem icon={<Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onRefine(); close(); }}>
      Add to refinement
    </MenuItem>
  ) : null;
  const blocks: (ReactNode | null)[] = [
    onMarkRead ? (
      <MenuItem icon={<Check className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />} onClick={() => { onMarkRead(); close(); }}>
        Mark as read
      </MenuItem>
    ) : null,
    hasMove ? moveItems : null,
    showFlag || hasUpdate || hasAssist ? (
      <>
        {showFlag ? flagItems : null}
        {updateGroup}
        {assistGroup}
      </>
    ) : null,
    onRefine ? refineItem : null,
  ];
  const present = blocks.filter((b) => b !== null);
  return <>{present.map((b, i) => <Fragment key={i}>{i > 0 && divider}{b}</Fragment>)}</>;
}
