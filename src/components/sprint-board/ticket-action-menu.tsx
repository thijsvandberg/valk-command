"use client";

import { Fragment, useState, useRef, useMemo, useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type { TicketReadiness, JiraStatus, Sprint } from "@/types/ticket";
import type { QuickMoveOption } from "@/lib/quick-moves";
import { isBacklogSprintName, isOverallRefinementSprint, extractTeamPrefix, sprintNumber } from "@/lib/sprint-utils";
import { swrFetcher } from "@/lib/api-client";
import { Search, Flag, ArrowDownToLine, ArrowUpToLine, Boxes, Check, ChevronRight, FilePen, Sparkles, CircleDot, ArrowRight, Inbox, ArrowRightLeft } from "lucide-react";
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
      // Clamp horizontally so the panel never runs off the right edge (the bar's
      // right-most dropdowns would otherwise overflow). Nested flyouts then flip
      // their own side from the clamped position.
      const menuWidth = parseInt(/\d+/.exec(width)?.[0] ?? "300", 10);
      const margin = 8;
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - menuWidth - margin));
      setPos({
        left,
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
  }, [anchorRef, width]);

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

// Per-destination icons for the inline quick-moves (BRDG-374): active = a dot, next =
// arrow-right, backlog = inbox. "More sprints" uses the move (arrow-left-right) icon.
const QUICK_MOVE_ICON: Record<QuickMoveOption["id"], ReactNode> = {
  active: <CircleDot className="h-3.5 w-3.5" strokeWidth={1.5} />,
  next: <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />,
  backlog: <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />,
};

/**
 * A menu row whose sub-content opens to the SIDE on hover (BRDG-374), matching the
 * /dev/exploration prototype - no click, no Back. Nesting works because
 * `group-hover/fly` targets the nearest `group/fly` ancestor and hovering any
 * descendant keeps every ancestor hovered; the `pl-1` gap bridges trigger -> panel.
 */
// Each flyout owns its open state rather than relying on CSS `group-hover`: nested
// flyouts reused the same `group/fly` name, so a child's `group-hover/fly` also matched
// the parent's hover and every sub-panel opened at once. Tracking hover per instance
// (onPointerEnter/Leave) keeps each level independent.
//
// `nested` flyouts hold other flyouts (e.g. Update), so their panel must NOT clip:
// overflow-y-auto computes overflow-x to auto too, which would cut off a child flyout
// that opens beside it. Leaf flyouts keep overflow-y-auto so a long picker can scroll.
function Flyout({ icon, label, width = "w-[240px]", nested = false, children }: { icon?: ReactNode; label: ReactNode; width?: string; nested?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  // Open to the left when the panel would run off the right edge (e.g. a deep cascade,
  // or the bulk bar's right-most dropdowns). Measured once the flyout opens, in a layout
  // effect so the trigger's final on-screen position is known (a pointer-enter handler
  // can fire before the parent panel has settled, leaving a nested flyout mis-sided).
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const panelWidth = parseInt(/\d+/.exec(width)?.[0] ?? "240", 10);
    const room = window.innerWidth - el.getBoundingClientRect().right;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSide(room < panelWidth + 16 ? "left" : "right");
  }, [open, width]);
  return (
    <div ref={ref} className="relative" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item ${open ? "bg-hover-list-item" : ""}`}
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary">{icon}</span>}
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
      </button>
      {/* Panel stays mounted (so it can be measured/queried) but is only shown for this
          flyout's own hover. */}
      <div className={`absolute top-0 z-20 transition-opacity duration-100 ${open ? "visible opacity-100" : "invisible opacity-0"} ${side === "left" ? "right-full pr-1" : "left-full pl-1"}`}>
        <div className={`${FLYOUT_PANEL} ${width} ${nested ? "overflow-visible" : "max-h-[min(70vh,440px)] overflow-y-auto"} py-1`}>{children}</div>
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
  excludeSprintIds,
  onSelect,
}: {
  sprints: Sprint[];
  pinnedSprintIds?: string[];
  /** Sprints already offered one level up (active / next / named backlog quick-moves)
   *  plus the selection's current sprint; omitted from the list to avoid duplicates. */
  excludeSprintIds?: Set<string>;
  onSelect: (sprintId: string) => void;
}) {
  const [query, setQuery] = useState("");
  // The two generic buckets lead the list (BRDG-374). The named backlog (e.g. "BT:
  // Backlog") is dropped here - the generic "Backlog" + the parent "Move to backlog"
  // already cover it - and "Overall refinement" is pinned at the top as its own bucket.
  const overall = useMemo(() => sprints.find((s) => isOverallRefinementSprint(s.name)) ?? null, [sprints]);
  const sorted = useMemo(() => {
    const exclude = excludeSprintIds ?? new Set<string>();
    const eligible = sprints.filter(
      (s) =>
        (s.state === "active" || s.state === "future") &&
        !isBacklogSprintName(s.name) &&
        !isOverallRefinementSprint(s.name) &&
        !exclude.has(s.id),
    );
    // Group by team, then ascending by sprint number so a team's sprints read in
    // series (BT: 143, BT: 144, BT: 145…); non-numbered names (e.g. "BT: TODO") sort
    // last within their team. Pinned (slot) sprints lead, in slot order.
    const pinnedOrder = pinnedSprintIds ?? [];
    return [...eligible].sort((a, b) => {
      const ai = pinnedOrder.indexOf(a.id);
      const bi = pinnedOrder.indexOf(b.id);
      if (ai !== -1 || bi !== -1) {
        if (ai !== -1 && bi !== -1) return ai - bi;
        return ai !== -1 ? -1 : 1;
      }
      const teamA = extractTeamPrefix(a.name) ?? "";
      const teamB = extractTeamPrefix(b.name) ?? "";
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return sprintNumber(a.name) - sprintNumber(b.name);
    });
  }, [sprints, pinnedSprintIds, excludeSprintIds]);

  const q = query.toLowerCase();
  const matches = (name: string) => !query || name.toLowerCase().includes(q);
  const showBacklog = matches("Backlog");
  const showOverall = overall != null && matches(overall.name);
  const filtered = query ? sorted.filter((s) => matches(s.name)) : sorted;
  const hasTopBuckets = showBacklog || showOverall;

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
        {showOverall && overall && (
          <button
            type="button"
            onClick={() => onSelect(overall.id)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            {overall.name}
          </button>
        )}
        {hasTopBuckets && filtered.length > 0 && <div className="mx-2 my-0.5 h-px bg-overlay-strong" />}
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            {s.name}
          </button>
        ))}
        {filtered.length === 0 && !hasTopBuckets && (
          <div className="px-3 py-2 text-body-sm text-text-tertiary">{query ? "No sprints found" : "No sprints available"}</div>
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
  refinements,
  onAddToRefinement,
  onMarkRead,
  epicValue,
  epicSuggestTicketKey,
  epicClearable,
  sprints,
  pinnedSprintIds,
  currentSprintIds,
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
  /** "New refinement…": opens the create-session modal. */
  onRefine?: () => void;
  /** Scheduled refinement sessions; when present, "Add to refinement" becomes a list
   *  of sessions + "New refinement…" (BRDG-374). */
  refinements?: { id: string; name: string; count?: number }[];
  onAddToRefinement?: (sessionId: string) => void;
  /** New story inbox (BRDG-373): renders a leading "Mark as read" item. Omitted on
   *  the board / epic children, whose menu is unchanged. */
  onMarkRead?: () => void;
  sprints?: Sprint[];
  pinnedSprintIds?: string[];
  /** The selection's current sprint id(s), excluded from "More sprints". Pass the one
   *  shared sprint when every target sits in it; empty when the selection is mixed. */
  currentSprintIds?: string[];
  /** Open straight into a group view (used by the bar's per-group icon dropdowns). */
  initialView?: MenuView;
  close: () => void;
}) {
  const hasQuickMoves = Boolean(onQuickMove && quickMoves && quickMoves.length > 0);
  // "More sprints" drops what is already reachable one level up: the active / next /
  // named-backlog quick-moves, plus the selection's current sprint (BRDG-374).
  const excludeSprintIds = useMemo(() => {
    const ids = new Set<string>(currentSprintIds ?? []);
    for (const q of quickMoves ?? []) if (q.targetSprintId) ids.add(q.targetSprintId);
    return ids;
  }, [quickMoves, currentSprintIds]);
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
          // Per-destination icon: active = dot, next = arrow-right, backlog = inbox.
          <MenuItem key={opt.id} icon={QUICK_MOVE_ICON[opt.id]} onClick={() => { onQuickMove!(opt); close(); }}>
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
        <Flyout icon={<ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.5} />} label="More sprints" width="w-[260px]">
          <SprintSubPanel sprints={sprints} pinnedSprintIds={pinnedSprintIds} excludeSprintIds={excludeSprintIds} onSelect={(id) => { onMoveSprint?.(id); close(); }} />
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
    <Flyout icon={<FilePen className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Update" width="w-[220px]" nested>
      {updateItems}
    </Flyout>
  ) : null;
  const assistGroup = hasAssist ? (
    <Flyout icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Assist" width="w-[200px]">
      {assistItems}
    </Flyout>
  ) : null;
  const hasRefineSessions = Boolean(refinements && refinements.length > 0 && onAddToRefinement);
  const refineItem = onRefine || hasRefineSessions ? (
    hasRefineSessions ? (
      <Flyout icon={<Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Add to refinement" width="w-[240px]">
        {refinements!.map((r) => (
          <MenuItem key={r.id} onClick={() => { onAddToRefinement!(r.id); close(); }}>
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
      </Flyout>
    ) : (
      <MenuItem icon={<Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => { onRefine!(); close(); }}>
        Add to refinement
      </MenuItem>
    )
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
    refineItem,
  ];
  const present = blocks.filter((b) => b !== null);
  return <>{present.map((b, i) => <Fragment key={i}>{i > 0 && divider}{b}</Fragment>)}</>;
}
