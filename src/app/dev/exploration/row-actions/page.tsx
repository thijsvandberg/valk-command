"use client";

/**
 * Throwaway exploration for BRDG-374: a shared, group-based row-actions module.
 *
 * Today the right-click menu and the multi-select bar are wired prop-by-prop in
 * three places (Sprint Board, Epic children, Inbox) via three separate dispatch
 * layers, so they drift and adding an action means touching all of them.
 *
 * This prototype models the proposed alternative: actions live in a small set of
 * cohesive GROUPS (Triage / Set / Move / Flag / Assist / Refinement / Copy, plus a
 * reserved Bookmark). A SURFACE declares which groups it wants; BOTH presentations
 * render from the same group definitions, so they stay in sync and a new action in
 * a group shows up everywhere that group is enabled.
 *
 * Two presentations driven by one config:
 *   - Right-click menu  -> Move is top-level (most used) with named sprint targets;
 *     Set and Assist nest one level deeper.
 *   - Multi-select bar  -> icon-only; a group with >1 action gets a dropdown.
 *
 * A live "tuner" lets us trial icon + name candidates for Set / Move in context.
 * Nothing here is wired to real dispatch; actions log to the on-page Action log.
 * Reachable at /dev/exploration/row-actions; not linked from app nav.
 */

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpToLine,
  Bookmark,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  Copy,
  FilePen,
  FolderInput,
  Flag,
  Forward,
  Hash,
  MailOpen,
  MousePointerClick,
  MoveRight,
  Pencil,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Tags,
  TrendingUp,
} from "lucide-react";

/* ------------------------------------------------------------------ model -- */

type GroupId = "triage" | "set" | "move" | "flag" | "assist" | "refine" | "copy" | "refresh" | "bookmark";

type Action = { id: string; label: string; target?: string; rankOnly?: boolean; flyout?: string[] };

type Group = {
  id: GroupId;
  label: string;
  Icon: LucideIcon;
  /** Right-click menu: render the actions inline near the top (Move = most used). */
  prominent?: boolean;
  /** Right-click menu: render behind a single parent item that opens a sub-menu. */
  nested?: boolean;
  /** List-level op (Copy / Refresh): only in the multi-select bar, never the row menu. */
  barOnly?: boolean;
  /** Not built yet; shown to prove the model absorbs new groups for free. */
  future?: boolean;
  actions: Action[];
};

// Pinned sprints first, then the generic destinations, then custom selection.
const MORE_SPRINTS = ["BT: 138", "BT: 144", "Overall refinement", "Backlog", "Choose sprint…"];
const REFINEMENTS = ["Refinement · Jun 25", "Refinement · Jul 2", "New refinement…"];

// Display order is the order groups appear in both presentations.
const GROUPS: Group[] = [
  {
    id: "triage",
    label: "Triage",
    Icon: MailOpen,
    actions: [{ id: "markRead", label: "Mark as read" }],
  },
  {
    id: "move",
    label: "Move",
    Icon: ArrowRightLeft,
    prominent: true,
    actions: [
      { id: "active", label: "Move to active sprint", target: "BT: 140" },
      { id: "next", label: "Move to next sprint", target: "BT: 142" },
      { id: "backlog", label: "Move to backlog", target: "BT: Backlog" },
      { id: "more", label: "Move to other sprint…", flyout: MORE_SPRINTS },
      { id: "top", label: "Move to top", rankOnly: true },
      { id: "bottom", label: "Move to bottom", rankOnly: true },
    ],
  },
  {
    id: "set",
    label: "Set",
    Icon: FilePen,
    nested: true,
    actions: [
      { id: "status", label: "Status" },
      { id: "readiness", label: "Readiness" },
      { id: "epic", label: "Epic" },
      { id: "assignee", label: "Assignee" },
      { id: "label", label: "Label" },
    ],
  },
  {
    id: "flag",
    label: "Flag",
    Icon: Flag,
    actions: [
      { id: "flag", label: "Flag" },
      { id: "unflag", label: "Remove flag" },
    ],
  },
  {
    id: "assist",
    label: "Assist",
    Icon: Sparkles,
    nested: true,
    actions: [
      { id: "review", label: "Review story" },
      { id: "subtasks", label: "Generate subtasks" },
      { id: "export", label: "Export summary" },
    ],
  },
  {
    id: "refine",
    label: "Refinement",
    Icon: Boxes,
    // One entry that opens the list of scheduled refinements + "New refinement…".
    actions: [{ id: "select", label: "Add to refinement", flyout: REFINEMENTS }],
  },
  {
    id: "copy",
    label: "Copy",
    Icon: Copy,
    barOnly: true,
    actions: [{ id: "copy", label: "Copy list" }],
  },
  {
    id: "refresh",
    label: "Refresh",
    Icon: RefreshCw,
    barOnly: true,
    actions: [{ id: "refresh", label: "Refresh from Jira" }],
  },
  {
    id: "bookmark",
    label: "Bookmark",
    Icon: Bookmark,
    future: true,
    actions: [{ id: "bookmark", label: "Bookmark" }],
  },
];

const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, Group>;

type Surface = { id: string; label: string; groups: GroupId[]; rank: boolean; metrics: boolean };

const SURFACES: Surface[] = [
  { id: "board", label: "Sprint Board", groups: ["move", "set", "flag", "assist", "refine", "copy", "refresh"], rank: true, metrics: true },
  { id: "epic", label: "Epic children", groups: ["move", "set", "flag", "assist", "refine", "copy"], rank: false, metrics: true },
  { id: "inbox", label: "Inbox", groups: ["triage", "move", "set", "flag", "assist", "refine", "copy"], rank: false, metrics: false },
];

/* ----------------------------------------------------------------- tuner -- */

const SET_NAMES = ["Update", "Set", "Edit", "Fields", "Properties"];
const SET_ICONS: { id: string; Icon: LucideIcon }[] = [
  { id: "filepen", Icon: FilePen },
  { id: "squarepen", Icon: SquarePen },
  { id: "pencil", Icon: Pencil },
  { id: "sliders", Icon: SlidersHorizontal },
  { id: "settings", Icon: Settings2 },
  { id: "tags", Icon: Tags },
];
const MOVE_ICONS: { id: string; Icon: LucideIcon }[] = [
  { id: "swap", Icon: ArrowRightLeft },
  { id: "folder", Icon: FolderInput },
  { id: "moveright", Icon: MoveRight },
  { id: "corner", Icon: CornerUpRight },
  { id: "forward", Icon: Forward },
];

/* ------------------------------------------------------------- primitives -- */

const PANEL = "rounded-xl border border-border-default bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)]";
const MENU_ITEM =
  "flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default";
const DIVIDER = "mx-2 my-1 h-px bg-overlay-strong";

type Affordance = "none" | "caret" | "underline" | "recessed";

type Cfg = {
  enabled: Set<GroupId>;
  rank: boolean;
  setName: string;
  icons: Partial<Record<GroupId, LucideIcon>>;
  affordance: Affordance;
};

// Renders a Lucide icon resolved at runtime. Passing the component as a prop keeps
// it out of "component created during render" territory (react-hooks/static-components).
function DynIcon({ icon: Icon, className, strokeWidth }: { icon: LucideIcon; className?: string; strokeWidth?: number }) {
  return <Icon className={className} strokeWidth={strokeWidth} />;
}

function visibleActions(g: Group, cfg: Cfg): Action[] {
  return g.actions.filter((a) => !(a.rankOnly && !cfg.rank));
}
function iconFor(g: Group, cfg: Cfg): LucideIcon {
  return cfg.icons[g.id] ?? g.Icon;
}
function labelFor(g: Group, cfg: Cfg): string {
  return g.id === "set" ? cfg.setName : g.label;
}

/* ---------------------------------------------------- right-click menu -- */

function SubMenu({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <div className="group/sub relative">
      <button type="button" className={MENU_ITEM}>
        {trigger}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
      </button>
      <div className="invisible absolute left-full top-0 z-10 pl-1 opacity-0 transition-opacity duration-100 group-hover/sub:visible group-hover/sub:opacity-100">
        <div className={`${PANEL} w-[200px] py-1`}>{children}</div>
      </div>
    </div>
  );
}

function NestedGroup({ group, cfg, onAction }: { group: Group; cfg: Cfg; onAction: (g: Group, a: Action) => void }) {
  return (
    <SubMenu
      trigger={
        <>
          <DynIcon icon={iconFor(group, cfg)} className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
          {labelFor(group, cfg)}
        </>
      }
    >
      {visibleActions(group, cfg).map((a) => (
        <button key={a.id} type="button" onClick={() => onAction(group, a)} className={MENU_ITEM}>
          {a.label}
        </button>
      ))}
    </SubMenu>
  );
}

const ICON_SPACER = <span className="h-3.5 w-3.5 shrink-0" />;

function MoveItem({ a, onAction }: { a: Action; onAction: (a: Action) => void }) {
  // Sprint destinations rely on their target chip and carry no leading icon (one
  // repeated Move glyph reads as noise); only the rank items get a distinct icon.
  if (a.flyout) {
    return (
      <SubMenu
        trigger={
          <>
            {ICON_SPACER}
            {a.label}
          </>
        }
      >
        {a.flyout.map((s) => (
          <button key={s} type="button" onClick={() => onAction({ ...a, label: s })} className={MENU_ITEM}>
            {s}
          </button>
        ))}
      </SubMenu>
    );
  }
  if (a.rankOnly) {
    return (
      <button type="button" onClick={() => onAction(a)} className={MENU_ITEM}>
        <DynIcon
          icon={a.id === "top" ? ArrowUpToLine : ArrowDownToLine}
          className="h-3.5 w-3.5 text-text-tertiary"
          strokeWidth={1.5}
        />
        {a.label}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => onAction(a)} className={MENU_ITEM}>
      {ICON_SPACER}
      {a.label}
      {a.target && (
        <span className="ml-auto rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-tertiary">
          {a.target}
        </span>
      )}
    </button>
  );
}

function ActionMenu({ cfg, onAction }: { cfg: Cfg; onAction: (g: Group, a: Action) => void }) {
  const has = (id: GroupId) => cfg.enabled.has(id);

  const clusters: (ReactNode | null)[] = [
    has("triage")
      ? GROUP_BY_ID.triage.actions.map((a) => (
          <button key={a.id} type="button" onClick={() => onAction(GROUP_BY_ID.triage, a)} className={MENU_ITEM}>
            <Check className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />
            <span className="text-text-primary">{a.label}</span>
          </button>
        ))
      : null,

    has("move")
      ? visibleActions(GROUP_BY_ID.move, cfg).map((a) => (
          <MoveItem key={a.id} a={a} onAction={(act) => onAction(GROUP_BY_ID.move, act)} />
        ))
      : null,

    has("set") ? <NestedGroup group={GROUP_BY_ID.set} cfg={cfg} onAction={onAction} /> : null,

    has("flag")
      ? visibleActions(GROUP_BY_ID.flag, cfg).map((a) => (
          <button key={a.id} type="button" onClick={() => onAction(GROUP_BY_ID.flag, a)} className={MENU_ITEM}>
            <Flag className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
            {a.label}
          </button>
        ))
      : null,

    has("assist") ? <NestedGroup group={GROUP_BY_ID.assist} cfg={cfg} onAction={onAction} /> : null,

    has("refine")
      ? visibleActions(GROUP_BY_ID.refine, cfg).map((a) =>
          a.flyout ? (
            <SubMenu
              key={a.id}
              trigger={
                <>
                  <Boxes className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
                  {a.label}
                </>
              }
            >
              {a.flyout.map((s) => (
                <button key={s} type="button" onClick={() => onAction(GROUP_BY_ID.refine, { ...a, label: s })} className={MENU_ITEM}>
                  {s}
                </button>
              ))}
            </SubMenu>
          ) : (
            <button key={a.id} type="button" onClick={() => onAction(GROUP_BY_ID.refine, a)} className={MENU_ITEM}>
              <Boxes className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
              {a.label}
            </button>
          ),
        )
      : null,

    has("bookmark")
      ? GROUP_BY_ID.bookmark.actions.map((a) => (
          <button key={a.id} type="button" onClick={() => onAction(GROUP_BY_ID.bookmark, a)} className={MENU_ITEM}>
            <Bookmark className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
            {a.label}
          </button>
        ))
      : null,
  ];

  const present = clusters.filter(Boolean);
  return (
    <div className={`${PANEL} w-[260px] py-1`}>
      {present.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <div className={DIVIDER} />}
          {c}
        </Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ multi-select bar -- */

const ICON_BTN =
  "relative grid h-9 w-9 place-items-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary cursor-pointer";

function BarGroupButton({ group, cfg, onAction }: { group: Group; cfg: Cfg; onAction: (g: Group, a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const acts = visibleActions(group, cfg);
  const multi = acts.length > 1 || acts.some((a) => a.flyout);

  if (!multi) {
    return (
      <button
        type="button"
        title={acts[0]?.label ?? labelFor(group, cfg)}
        className={ICON_BTN}
        onClick={() => acts[0] && onAction(group, acts[0])}
      >
        <DynIcon icon={iconFor(group, cfg)} className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>
    );
  }

  // Flatten target + flyout actions into a single dropdown list (bars do not nest).
  const rows: { key: string; label: string; target?: string; action: Action }[] = [];
  for (const a of acts) {
    if (a.flyout) a.flyout.forEach((s) => rows.push({ key: a.id + s, label: s, action: { ...a, label: s } }));
    else rows.push({ key: a.id, label: a.label, target: a.target, action: a });
  }

  const aff = cfg.affordance;
  // Caret mode widens the button into a pill so the chevron sits beside the icon at
  // a legible size; other modes keep the square icon button.
  const btnClass =
    aff === "caret"
      ? "relative flex h-9 items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary cursor-pointer"
      : `${ICON_BTN} ${aff === "recessed" ? "bg-[var(--color-brand-500)]/[0.12] hover:bg-[var(--color-brand-500)]/[0.18]" : ""}`;
  return (
    <div className="relative">
      <button type="button" title={labelFor(group, cfg)} className={btnClass} onClick={() => setOpen((v) => !v)}>
        <DynIcon icon={iconFor(group, cfg)} className="h-[18px] w-[18px]" strokeWidth={1.5} />
        {aff === "caret" && <ChevronDown className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />}
        {aff === "underline" && (
          <span className="pointer-events-none absolute bottom-[4px] left-1/2 h-px w-3 -translate-x-1/2 bg-[var(--color-brand-400)]/70" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute bottom-full left-0 z-20 mb-1.5 ${PANEL} w-[200px] py-1`}>
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  onAction(group, r.action);
                  setOpen(false);
                }}
              >
                {r.label}
                {r.target && (
                  <span className="ml-auto rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-tertiary">
                    {r.target}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const BAR_DIVIDER = "mx-1 h-5 w-px shrink-0 bg-overlay-strong";

function BulkBar({
  cfg,
  count,
  total,
  sp,
  bv,
  allChecked,
  onToggleAll,
  onAction,
  onClear,
}: {
  cfg: Cfg;
  count: number;
  total?: number;
  sp?: number;
  bv?: number;
  allChecked?: boolean;
  onToggleAll?: () => void;
  onAction: (g: Group, a: Action) => void;
  onClear: () => void;
}) {
  const primary: GroupId[] = ["set", "move", "flag", "assist"];
  const listOps: GroupId[] = ["refine", "copy", "refresh", "bookmark"];
  const primaryOn = primary.filter((id) => cfg.enabled.has(id));
  const listOn = listOps.filter((id) => cfg.enabled.has(id));

  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl border border-border-default bg-[var(--color-surface-floating)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]">
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          title={allChecked ? "Deselect all" : "Select all"}
          className={`grid h-4 w-4 shrink-0 place-items-center rounded ${allChecked ? "bg-[var(--color-brand-400)]" : "border border-border-strong"} cursor-pointer`}
        >
          {allChecked && <Check className="h-3 w-3 text-[var(--color-surface-base)]" strokeWidth={3} />}
        </button>
      )}

      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-body-sm font-medium tabular-nums text-text-secondary">
        <span>
          {count}
          {total ? `/${total}` : ""} selected
        </span>
        {sp !== undefined && sp > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-tertiary">
            <Hash className="h-3 w-3" strokeWidth={2} />
            {sp}
          </span>
        )}
        {bv !== undefined && bv > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-[var(--color-testing-500)]/[0.15] px-1.5 py-0.5 text-caption font-medium text-[var(--color-testing-300)]">
            <TrendingUp className="h-3 w-3" strokeWidth={2} />
            {bv}
          </span>
        )}
      </span>

      <span className={BAR_DIVIDER} />

      {/* Triage stays a labelled primary: it is the headline inbox action. */}
      {cfg.enabled.has("triage") && (
        <>
          <button
            type="button"
            onClick={() => onAction(GROUP_BY_ID.triage, GROUP_BY_ID.triage.actions[0])}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 py-1.5 text-body-sm font-medium text-white transition-colors duration-150 hover:bg-[var(--color-brand-400)] cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            Mark {count} as read
          </button>
          <span className={BAR_DIVIDER} />
        </>
      )}

      <div className="flex items-center gap-1.5">
        {primaryOn.map((id) => (
          <BarGroupButton key={id} group={GROUP_BY_ID[id]} cfg={cfg} onAction={onAction} />
        ))}
      </div>

      {listOn.length > 0 && (
        <>
          <span className={BAR_DIVIDER} />
          <div className="flex items-center gap-1.5">
            {listOn.map((id) => (
              <BarGroupButton key={id} group={GROUP_BY_ID[id]} cfg={cfg} onAction={onAction} />
            ))}
          </div>
        </>
      )}

      <span className={BAR_DIVIDER} />

      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-body-sm text-text-tertiary transition-colors duration-150 hover:text-text-secondary cursor-pointer"
      >
        Clear
      </button>
    </div>
  );
}

/* --------------------------------------------------------- chrome / page -- */

function Toggle({ on, label, sub, onClick }: { on: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-body-sm transition-colors duration-150 ${
        on
          ? "border-[var(--color-brand-400)]/40 bg-[var(--color-brand-500)]/[0.10] text-[var(--color-brand-300)]"
          : "border-border-default text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
      }`}
    >
      <span className={`grid h-3.5 w-3.5 place-items-center rounded ${on ? "bg-[var(--color-brand-400)]" : "border border-border-strong"}`}>
        {on && <Check className="h-2.5 w-2.5 text-[var(--color-surface-base)]" strokeWidth={3} />}
      </span>
      {label}
      {sub && <span className="text-caption text-text-muted">{sub}</span>}
    </button>
  );
}

function IconChoice({ Icon, active, onClick }: { Icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-lg border transition-colors duration-150 ${
        active
          ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]"
          : "border-border-default text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}

const MOCK_ROWS = [
  { key: "VPL-46742", title: "Move action clicks to parent", sp: 3, bv: 2 },
  { key: "VPL-46664", title: "Stabilize VR tests", sp: 5, bv: 1 },
  { key: "VPL-46265", title: "Add Stryker to improve code quality", sp: 2, bv: 5 },
  { key: "VPL-45410", title: "Correct DataLayer roomType + siteLanguage", sp: 8, bv: 3 },
];

export default function RowActionsExploration() {
  const [surfaceId, setSurfaceId] = useState<string>("board");
  const [enabled, setEnabled] = useState<Set<GroupId>>(new Set(SURFACES[0].groups));
  const [rank, setRank] = useState<boolean>(SURFACES[0].rank);
  const [setName, setSetName] = useState<string>("Update");
  const [setIcon, setSetIcon] = useState<LucideIcon>(FilePen);
  const [moveIcon, setMoveIcon] = useState<LucideIcon>(ArrowRightLeft);
  const [affordance, setAffordance] = useState<Affordance>("caret");
  const [metrics, setMetrics] = useState<boolean>(SURFACES[0].metrics);
  const [log, setLog] = useState<string[]>([]);
  const [cursorMenu, setCursorMenu] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const cfg: Cfg = { enabled, rank, setName, icons: { set: setIcon, move: moveIcon }, affordance };

  const selectedRows = MOCK_ROWS.filter((r) => selected.has(r.key));
  const spSum = selectedRows.reduce((n, r) => n + r.sp, 0);
  const bvSum = selectedRows.reduce((n, r) => n + r.bv, 0);
  const allChecked = selected.size === MOCK_ROWS.length && selected.size > 0;

  function selectSurface(s: Surface) {
    setSurfaceId(s.id);
    setEnabled(new Set(s.groups));
    setRank(s.rank);
    setMetrics(s.metrics);
  }

  function toggleGroup(id: GroupId) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fire(g: Group, a: Action) {
    setLog((prev) => [`${labelFor(g, cfg)} → ${a.label}`, ...prev].slice(0, 6));
    setCursorMenu(null);
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-10 py-8">
      <Link
        href="/dev/exploration"
        className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Exploration
      </Link>

      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
        <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.75} />
        BRDG-374
      </p>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">Row actions — shared groups</h1>
      <p className="mt-2 max-w-[760px] text-body-sm leading-[1.7] text-text-muted">
        Actions live in cohesive <strong className="text-text-secondary">groups</strong>. A surface declares which groups it wants;
        the right-click menu and the multi-select bar both render from the same definitions, so they cannot drift and a new action
        added to a group appears everywhere that group is on. Pick a surface, toggle groups, and trial Set/Move icons + the Set name
        below. Nothing is wired to real dispatch — actions land in the log.
      </p>

      {/* Controls */}
      <div className="mt-7 max-w-[760px] rounded-xl border border-border-default bg-[var(--color-surface-floating)]/60 p-4">
        <div className="text-caption font-semibold uppercase tracking-wider text-text-muted">Surface preset</div>
        <div className="mt-2 flex gap-1.5">
          {SURFACES.map((s) => {
            const active = surfaceId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => selectSurface(s)}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors duration-150 ${
                  active
                    ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]"
                    : "border-border-default text-text-secondary hover:bg-overlay-subtle"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-caption font-semibold uppercase tracking-wider text-text-muted">Groups</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <Toggle
              key={g.id}
              on={enabled.has(g.id)}
              label={labelFor(g, cfg)}
              sub={g.future ? "soon" : undefined}
              onClick={() => toggleGroup(g.id)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Toggle on={rank} label="Manual rank context" sub="Move to top / bottom" onClick={() => setRank((v) => !v)} />
          <Toggle on={metrics} label="SP / BV counters" onClick={() => setMetrics((v) => !v)} />
          <span className="text-caption text-text-muted">Rank shows only on ordered lists; counters are off where points/value aren&rsquo;t tracked (inbox).</span>
        </div>
      </div>

      {/* Tuner */}
      <div className="mt-4 max-w-[760px] rounded-xl border border-border-default bg-[var(--color-surface-floating)]/60 p-4">
        <div className="text-caption font-semibold uppercase tracking-wider text-text-muted">Tune labels &amp; icons</div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="w-[68px] text-body-sm text-text-muted">Set name</span>
            <div className="flex gap-1">
              {SET_NAMES.map((n) => (
                <button
                  key={n}
                  onClick={() => setSetName(n)}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-body-sm transition-colors duration-150 ${
                    setName === n
                      ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]"
                      : "border-border-default text-text-secondary hover:bg-overlay-subtle"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="w-[68px] text-body-sm text-text-muted">Set icon</span>
            <div className="flex gap-1.5">
              {SET_ICONS.map(({ id, Icon }) => (
                <IconChoice key={id} Icon={Icon} active={setIcon === Icon} onClick={() => setSetIcon(() => Icon)} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[68px] text-body-sm text-text-muted">Move icon</span>
            <div className="flex gap-1.5">
              {MOVE_ICONS.map(({ id, Icon }) => (
                <IconChoice key={id} Icon={Icon} active={moveIcon === Icon} onClick={() => setMoveIcon(() => Icon)} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-[68px] text-body-sm text-text-muted">Dropdown cue</span>
          <div className="flex gap-1">
            {(["none", "caret", "underline", "recessed"] as Affordance[]).map((a) => (
              <button
                key={a}
                onClick={() => setAffordance(a)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-body-sm capitalize transition-colors duration-150 ${
                  affordance === a
                    ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]"
                    : "border-border-default text-text-secondary hover:bg-overlay-subtle"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <span className="text-caption text-text-muted">Marks which bar icons open a menu.</span>
        </div>
      </div>

      {/* Presentations (stacked: the bar needs room, the menu is narrow) */}
      <div className="mt-10 flex max-w-[960px] flex-col gap-12">
        <div>
          <h2 className="text-heading-sm font-semibold text-text-primary">Right-click menu</h2>
          <p className="mt-1 mb-4 max-w-[480px] text-body-sm leading-[1.6] text-text-muted">
            Move is top-level with named sprint targets; the rest sit under &ldquo;Move to other sprint&rdquo;. Set and Assist nest one level
            deeper — hover them for the sub-menu.
          </p>
          <ActionMenu cfg={cfg} onAction={fire} />
        </div>

        <div>
          <h2 className="text-heading-sm font-semibold text-text-primary">Multi-select bar</h2>
          <p className="mt-1 mb-4 max-w-[480px] text-body-sm leading-[1.6] text-text-muted">
            Icon-only for compactness; a group with more than one action opens a dropdown. Hover an icon for its label.
          </p>
          <BulkBar
            cfg={cfg}
            count={3}
            total={23}
            sp={metrics ? 10 : undefined}
            bv={metrics ? 5 : undefined}
            allChecked={false}
            onToggleAll={() => undefined}
            onAction={fire}
            onClear={() => undefined}
          />
        </div>
      </div>

      {/* Interactive: right-click + selection on mock rows */}
      <h2 className="mt-14 text-heading-sm font-semibold text-text-primary">Try it on rows</h2>
      <p className="mt-1 mb-4 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        Right-click a row to open the menu at the cursor; tick rows to raise the bar. Both reflect the surface + groups above.
      </p>
      <div className="max-w-[680px] overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-floating)]/40">
        {MOCK_ROWS.map((r) => {
          const checked = selected.has(r.key);
          return (
            <div
              key={r.key}
              onContextMenu={(e) => {
                e.preventDefault();
                setCursorMenu({ x: e.clientX, y: e.clientY });
              }}
              className={`flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-0 ${checked ? "bg-[var(--color-brand-500)]/[0.06]" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggleRow(r.key)}
                className={`grid h-4 w-4 shrink-0 place-items-center rounded ${checked ? "bg-[var(--color-brand-400)]" : "border border-border-strong"} cursor-pointer`}
              >
                {checked && <Check className="h-3 w-3 text-[var(--color-surface-base)]" strokeWidth={3} />}
              </button>
              <span className="font-mono text-caption text-text-muted">{r.key}</span>
              <span className="text-body-sm text-text-secondary">{r.title}</span>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="mt-3 max-w-[680px]">
          <BulkBar
            cfg={cfg}
            count={selected.size}
            total={MOCK_ROWS.length}
            sp={metrics ? spSum : undefined}
            bv={metrics ? bvSum : undefined}
            allChecked={allChecked}
            onToggleAll={() => setSelected(allChecked ? new Set() : new Set(MOCK_ROWS.map((r) => r.key)))}
            onAction={fire}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

      {cursorMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCursorMenu(null)} />
          <div className="fixed z-50" style={{ left: cursorMenu.x, top: cursorMenu.y }}>
            <ActionMenu cfg={cfg} onAction={fire} />
          </div>
        </>
      )}

      {/* Action log */}
      <h2 className="mt-14 text-heading-sm font-semibold text-text-primary">Action log</h2>
      <p className="mt-1 mb-3 text-body-sm text-text-muted">What a real surface would dispatch through the shared adapter.</p>
      <div className="max-w-[680px] rounded-xl border border-border-default bg-[var(--color-surface-base)] p-3 font-mono text-body-sm">
        {log.length === 0 ? (
          <span className="text-text-muted">No actions yet — click something above.</span>
        ) : (
          log.map((l, i) => (
            <div key={i} className={i === 0 ? "text-[var(--color-brand-300)]" : "text-text-tertiary"}>
              {l}
            </div>
          ))
        )}
      </div>

      {/* Group × surface matrix */}
      <h2 className="mt-14 text-heading-sm font-semibold text-text-primary">Group &times; surface</h2>
      <p className="mt-1 mb-4 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        Which groups each in-scope surface enables. One definition, composed differently per surface.
      </p>
      <div className="max-w-[680px] overflow-x-auto">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-text-muted">
              <th className="py-2 pr-4 font-medium">Group</th>
              {SURFACES.map((s) => (
                <th key={s.id} className="px-3 py-2 text-center font-medium">
                  {s.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => {
              return (
                <tr key={g.id} className="border-b border-border-subtle">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2 text-text-secondary">
                      <DynIcon icon={iconFor(g, cfg)} className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
                      {labelFor(g, cfg)}
                      {g.future && (
                        <span className="rounded bg-overlay-default px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">soon</span>
                      )}
                    </span>
                  </td>
                  {SURFACES.map((s) => (
                    <td key={s.id} className="px-3 py-2 text-center">
                      {s.groups.includes(g.id) ? (
                        <Check className="mx-auto h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={2} />
                      ) : (
                        <span className="text-text-muted">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-caption text-text-muted">{g.actions.map((a) => a.label).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
