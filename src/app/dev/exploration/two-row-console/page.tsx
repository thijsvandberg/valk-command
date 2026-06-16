"use client";

/**
 * Throwaway exploration: the chosen "Two-row console" - Unified controls + a
 * two-pane filter dropdown. Built out from /dev/exploration/board-chrome and
 * the earlier toolbar/weergave comparison.
 *
 * Decisions baked in here:
 *   - Toolbar: UNIFIED CONTROLS - search, sort and filter live in one segmented
 *     cluster on the right. Two rows total; no separate filter bar.
 *   - Filter dropdown: TWO-PANE - a category rail on the left, options on the
 *     right. Keeps today's per-category SEARCH and the styled option BADGES.
 *   - Columns / field visibility moved behind a button in the dropdown HEADER,
 *     so the filter panel stays about filtering and the columns settings are one
 *     click away without their own toolbar button.
 *   - Sort opens a real dropdown (fields + direction + reset).
 *
 * Everything is interactive: open search/sort/filter, toggle filters/columns,
 * switch sort. State is local; nothing is wired to a real board. Reachable at
 * /dev/exploration/two-row-console; not linked from the app nav.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarRange,
  Search,
  MoreHorizontal,
  Bell,
  ChevronDown,
  ChevronRight,
  Inbox,
  Bookmark,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  ListFilter,
  Eye,
  Check,
  X,
  Pin,
  Hash,
  TrendingUp,
  AlertTriangle,
  CheckSquare,
  SquareArrowOutUpRight,
  User,
  Bug,
  Zap,
  RotateCcw,
} from "lucide-react";

/* ============================================================ shared atoms == */

const GREEN = "#34d36a";
const DONE = "#34d36a";
const TEST = "#f5b544";
const PROG = "#5b9df9";
const ZINC = "#9ca3af";

const SPRINTS = ["BT: 139", "BT: 140", "BT: 141", "BT: 142", "BT: 143", "BT: TODO"];

function Wordmark() {
  return (
    <span className="font-[family-name:var(--font-space-mono)] text-[19px] font-bold lowercase tracking-[-0.02em] text-text-primary">
      bridge<span className="bridge-caret text-[var(--color-brand-400)]">_</span>
    </span>
  );
}

function WordmarkMenu() {
  return (
    <button
      className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      title="Open navigation"
    >
      <Wordmark />
      <ChevronDown
        className="h-3.5 w-3.5 -translate-x-1 text-text-muted opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100"
        strokeWidth={2}
      />
    </button>
  );
}

function SprintContext() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CalendarRange className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.75} />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">BT: 139</span>
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: GREEN, boxShadow: `0 0 7px ${GREEN}` }} />
    </div>
  );
}

function FullnessMeter() {
  const legend = (color: string, n: number) => (
    <span className="flex items-center gap-1 text-[11px] tabular-nums text-text-tertiary">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {n}
    </span>
  );
  const seg = (label: string, on?: boolean) => (
    <span
      key={label}
      className={`grid h-5 place-items-center rounded-[6px] px-1.5 text-[11px] font-semibold tracking-tight ${
        on ? "bg-overlay-strong text-text-primary" : "text-text-muted"
      }`}
    >
      {label}
    </span>
  );
  return (
    <div className="hidden items-center gap-3 2xl:flex">
      <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
        {seg("SP", true)}
        {seg("BV")}
        {seg("#")}
      </div>
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-1.5 w-[130px] overflow-hidden rounded-full bg-overlay-default">
          <span style={{ width: "20%", background: DONE }} />
          <span style={{ width: "5%", background: TEST }} />
          <span style={{ width: "8%", background: PROG }} />
        </div>
        <span className="text-[12px] font-medium tabular-nums text-text-secondary">33%</span>
      </div>
      <div className="flex items-center gap-2">
        {legend(DONE, 9)}
        {legend(TEST, 2)}
        {legend(PROG, 10)}
      </div>
      <span className="h-4 w-px bg-border-strong" />
      <span className="text-[12px] tabular-nums text-text-muted">day 6/10</span>
    </div>
  );
}

function RightActions() {
  const btn =
    "group relative grid h-8 w-8 place-items-center rounded-lg cursor-pointer text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary";
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-overlay-subtle p-0.5 ring-1 ring-border-default/70">
      <button className={btn} title="Notifications">
        <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        <span
          className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-[var(--color-surface-chrome)]"
          style={{ background: "#ef4444" }}
        >
          1
        </span>
      </button>
      <button className={btn} title="More">
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function AllPill() {
  return (
    <span className="grid h-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-brand-500)_16%,transparent)] px-3 text-[13px] font-semibold bc-brand-fg">
      All
    </span>
  );
}

function BacklogsPill() {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-secondary ring-1 ring-border-default">
      <Inbox className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
      Backlogs
      <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
    </span>
  );
}

function SprintPills() {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {SPRINTS.map((s, i) => (
        <span
          key={s}
          className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors cursor-pointer ${
            i === 0
              ? "bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] font-semibold bc-brand-fg"
              : "font-medium text-text-tertiary hover:bg-hover-interactive"
          }`}
        >
          {i === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />}
          {s}
        </span>
      ))}
    </div>
  );
}

function SavedControl() {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-text-secondary cursor-pointer hover:bg-hover-interactive">
      <Bookmark className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
      Saved
      <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
    </span>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
        on ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]" : "border-border-strong bg-transparent"
      }`}
    >
      {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_30%,transparent)] px-1 text-[10px] font-bold bc-brand-fg">
      {n}
    </span>
  );
}

/* =============================================== filter model + badges ===== */

type CatKind = "status" | "epic" | "assignee" | "readiness" | "changes" | "type" | "gaps" | "team";
type Opt = { id: string; label: string; color?: string; dot?: string };
type Cat = { key: string; label: string; kind: CatKind; searchable?: boolean; opts: Opt[] };

const STATUS_TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  todo: { bg: "rgba(113,113,122,0.14)", fg: "#52525b", dot: ZINC },
  prog: { bg: "rgba(91,157,249,0.16)", fg: "#2f74c0", dot: PROG },
  test: { bg: "rgba(245,181,68,0.18)", fg: "#b8791b", dot: TEST },
  done: { bg: "rgba(52,211,106,0.16)", fg: "#1f9d57", dot: DONE },
};

const CATS: Cat[] = [
  {
    key: "status",
    label: "Status",
    kind: "status",
    opts: [
      { id: "todo", label: "To do" },
      { id: "prog", label: "In progress" },
      { id: "test", label: "Test" },
      { id: "done", label: "Done" },
    ],
  },
  {
    key: "epic",
    label: "Epic",
    kind: "epic",
    searchable: true,
    opts: [
      { id: "log", label: "Logging & metrics", color: "#3b82f6" },
      { id: "grp", label: "Group Reservations", color: "#db2777" },
      { id: "arie", label: "ARIE", color: "#16a34a" },
      { id: "dates", label: "BT: Dates / Calendar", color: "#e11d48" },
      { id: "rooms", label: "BT: Rooms", color: "#7c3aed" },
    ],
  },
  {
    key: "assignee",
    label: "Assignee",
    kind: "assignee",
    searchable: true,
    opts: [
      { id: "rb", label: "Rik Bakker", color: "#c08a2b" },
      { id: "vv", label: "Vera Visser", color: "#6d4ed6" },
      { id: "fv", label: "Finn de Vries", color: "#8b3fd6" },
      { id: "dk", label: "Dana Klein", color: "#d63b5b" },
      { id: "tv", label: "Tom Vos", color: "#0f9d8f" },
      { id: "un", label: "Unassigned" },
    ],
  },
  {
    key: "readiness",
    label: "Readiness",
    kind: "readiness",
    opts: [
      { id: "ready", label: "Ready", dot: DONE },
      { id: "needs", label: "Needs refinement", dot: TEST },
      { id: "blocked", label: "Blocked", dot: "#ef4444" },
    ],
  },
  {
    key: "changes",
    label: "Changes",
    kind: "changes",
    opts: [
      { id: "local", label: "Local changes", dot: "#5b9df9" },
      { id: "conflict", label: "Conflict", dot: TEST },
      { id: "removed", label: "Removed from Jira", dot: "#ef4444" },
    ],
  },
  {
    key: "type",
    label: "Type",
    kind: "type",
    opts: [
      { id: "story", label: "Story" },
      { id: "task", label: "Task" },
      { id: "bug", label: "Bug" },
      { id: "spike", label: "Spike" },
    ],
  },
  {
    key: "gaps",
    label: "Gaps",
    kind: "gaps",
    opts: [
      { id: "no_points", label: "No story points", dot: TEST },
      { id: "no_bv", label: "No business value", dot: TEST },
    ],
  },
  {
    key: "team",
    label: "Team",
    kind: "team",
    opts: [
      { id: "platform", label: "Platform" },
      { id: "booking", label: "Booking" },
      { id: "data", label: "Data" },
    ],
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Mirrors today's FilterDropdown renderOption badges so the styling carries over. */
function OptionContent({ kind, opt }: { kind: CatKind; opt: Opt }) {
  switch (kind) {
    case "status": {
      const t = STATUS_TONE[opt.id];
      return (
        <span className="flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.fg }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
          {opt.label}
        </span>
      );
    }
    case "epic":
      return (
        <span
          className="truncate rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ color: opt.color, borderColor: `color-mix(in srgb, ${opt.color} 40%, transparent)`, background: `color-mix(in srgb, ${opt.color} 8%, transparent)` }}
        >
          {opt.label}
        </span>
      );
    case "assignee":
      return opt.id === "un" ? (
        <span className="flex items-center gap-2 text-[13px] text-text-secondary">
          <span className="grid h-5 w-5 place-items-center rounded-full text-text-muted ring-1 ring-border-default">
            <User className="h-3 w-3" strokeWidth={1.75} />
          </span>
          {opt.label}
        </span>
      ) : (
        <span className="flex items-center gap-2 text-[13px] text-text-primary">
          <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: opt.color }}>
            {initials(opt.label)}
          </span>
          {opt.label}
        </span>
      );
    case "type": {
      const Icon = opt.id === "story" ? Bookmark : opt.id === "task" ? CheckSquare : opt.id === "bug" ? Bug : Zap;
      const color = opt.id === "story" ? "#16a34a" : opt.id === "task" ? "#3b82f6" : opt.id === "bug" ? "#ef4444" : "#7c3aed";
      return (
        <span className="flex items-center gap-2 text-[13px] text-text-primary">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color }} />
          {opt.label}
        </span>
      );
    }
    case "team":
      return <span className="text-[13px] text-text-primary">{opt.label}</span>;
    default:
      return (
        <span className="flex items-center gap-2 text-[13px] text-text-primary">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: opt.dot }} />
          {opt.label}
        </span>
      );
  }
}

/* ---- display / field visibility (folded behind a header button) ---------- */
const COLS: { id: string; label: string; group: 0 | 1 }[] = [
  { id: "flag", label: "Flag", group: 0 },
  { id: "refinement", label: "Refinement", group: 0 },
  { id: "quality", label: "Quality Score (QS)", group: 0 },
  { id: "notes", label: "Notes", group: 0 },
  { id: "poReadiness", label: "PO readiness", group: 0 },
  { id: "editState", label: "Edit state", group: 0 },
  { id: "storyPoints", label: "Story points (SP)", group: 1 },
  { id: "businessValue", label: "Business value (BV)", group: 1 },
  { id: "epic", label: "Epic", group: 1 },
  { id: "assignee", label: "Assignee", group: 1 },
];
const COL_DEFAULTS: Record<string, boolean> = {
  flag: true,
  refinement: true,
  quality: true,
  notes: true,
  poReadiness: true,
  editState: true,
  storyPoints: false,
  businessValue: false,
  epic: true,
  assignee: true,
};

function ColCheck({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] cursor-pointer transition-colors hover:bg-hover-list-item">
      <Checkbox on={on} />
      <span className={`flex-1 truncate ${on ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
    </button>
  );
}

/* =================================================== two-pane filter panel = */

type FilterState = {
  selected: Record<string, string[]>;
  toggle: (cat: string, opt: string) => void;
  count: (cat: string) => number;
  total: number;
  clearAll: () => void;
  cols: Record<string, boolean>;
  toggleCol: (id: string) => void;
  resetCols: () => void;
};

function TwoPanePanel(s: FilterState) {
  const [active, setActive] = useState<string>(CATS[0].key);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"filters" | "display">("filters");
  const cat = CATS.find((c) => c.key === active)!;
  const opts =
    cat.searchable && search.trim()
      ? cat.opts.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
      : cat.opts;

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[548px] overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.45)] ring-1 ring-border-strong">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />

      {/* header: title + display toggle (behind a button) + contextual action */}
      <div className="flex items-center justify-between border-b border-border-default px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          {view === "display" ? (
            <>
              <Eye className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />
              Display
            </>
          ) : (
            <>
              <ListFilter className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />
              Filters
              {s.total > 0 && <CountBadge n={s.total} />}
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView((v) => (v === "display" ? "filters" : "display"))}
            className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium cursor-pointer transition-colors ${
              view === "display"
                ? "bg-[color-mix(in_srgb,var(--color-brand-500)_15%,transparent)] bc-brand-fg"
                : "text-text-tertiary ring-1 ring-border-default hover:bg-hover-interactive hover:text-text-secondary"
            }`}
            title="Display settings"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            Display
          </button>
          {view === "display" ? (
            <button onClick={s.resetCols} className="flex items-center gap-1 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-primary cursor-pointer">
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
              Reset
            </button>
          ) : (
            <button
              onClick={s.clearAll}
              disabled={s.total === 0}
              className="text-[12px] font-medium text-text-tertiary transition-colors enabled:hover:text-text-primary disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {view === "display" ? (
        /* display settings: two labelled groups across the width */
        <div className="grid grid-cols-2 gap-x-4 p-2.5">
          <div>
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">PO meta</p>
            {COLS.filter((c) => c.group === 0).map((c) => (
              <ColCheck key={c.id} label={c.label} on={s.cols[c.id]} onClick={() => s.toggleCol(c.id)} />
            ))}
          </div>
          <div>
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Badges</p>
            {COLS.filter((c) => c.group === 1).map((c) => (
              <ColCheck key={c.id} label={c.label} on={s.cols[c.id]} onClick={() => s.toggleCol(c.id)} />
            ))}
          </div>
        </div>
      ) : (
        /* filters: category rail + options pane */
        <div className="flex h-[306px]">
          <div className="w-[186px] shrink-0 overflow-y-auto border-r border-border-default p-1.5">
            {CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setActive(c.key);
                  setSearch("");
                }}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] cursor-pointer transition-colors ${
                  c.key === active ? "bg-overlay-default font-medium text-text-primary" : "text-text-secondary hover:bg-hover-list-item"
                }`}
              >
                <span className="flex items-center gap-2">
                  {s.count(c.key) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
                  {c.label}
                </span>
                {s.count(c.key) > 0 && <CountBadge n={s.count(c.key)} />}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {cat.searchable && (
              <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${cat.label.toLowerCase()}...`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="grid h-4 w-4 place-items-center rounded-full text-text-muted hover:text-text-secondary cursor-pointer">
                    <X className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
              {opts.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-text-muted">No matches</p>
              ) : (
                opts.map((opt) => {
                  const on = (s.selected[cat.key] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => s.toggle(cat.key, opt.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-hover-list-item"
                    >
                      <Checkbox on={on} />
                      <OptionContent kind={cat.kind} opt={opt} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================================================== sort dropdown ========= */

const SORT_OPTIONS: { field: string; label: string; defaultDir: "asc" | "desc" }[] = [
  { field: "rank", label: "Jira rank (default)", defaultDir: "asc" },
  { field: "lastChanged", label: "Last changed", defaultDir: "desc" },
  { field: "quality", label: "Quality Score", defaultDir: "desc" },
  { field: "bv", label: "Business Value", defaultDir: "desc" },
  { field: "points", label: "Story points", defaultDir: "desc" },
  { field: "key", label: "Ticket key", defaultDir: "asc" },
  { field: "title", label: "Title", defaultDir: "asc" },
  { field: "jiraStatus", label: "Jira status", defaultDir: "asc" },
  { field: "assignee", label: "Assignee", defaultDir: "asc" },
  { field: "readiness", label: "Readiness", defaultDir: "asc" },
];

function SortPanel({
  field,
  dir,
  onChange,
}: {
  field: string;
  dir: "asc" | "desc";
  onChange: (field: string, dir: "asc" | "desc") => void;
}) {
  const active = field !== "rank";
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] py-1.5 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.45)] ring-1 ring-border-strong">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Sort by</p>
      {SORT_OPTIONS.map((opt) => {
        const on = opt.field === field;
        return (
          <button
            key={opt.field}
            onClick={() => onChange(opt.field, on ? (dir === "asc" ? "desc" : "asc") : opt.defaultDir)}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-[13px] cursor-pointer transition-colors hover:bg-hover-list-item ${
              on ? "bg-overlay-subtle text-text-primary" : "text-text-secondary"
            }`}
          >
            <span className="flex items-center gap-2">
              {on && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
              {opt.label}
            </span>
            {on &&
              (dir === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />
              ))}
          </button>
        );
      })}
      {active && (
        <>
          <div className="my-1 h-px bg-overlay-default" />
          <button
            onClick={() => onChange("rank", "asc")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-text-tertiary transition-colors hover:bg-hover-list-item hover:text-text-secondary cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2} />
            Reset to default
          </button>
        </>
      )}
    </div>
  );
}

/* =================================================== faux board content === */

type Tone = "todo" | "prog" | "test" | "done";
const TONE: Record<Tone, { bg: string; fg: string; dot: string; short: string }> = {
  todo: { bg: "rgba(113,113,122,0.12)", fg: "#6b7280", dot: ZINC, short: "TODO" },
  prog: { bg: "rgba(91,157,249,0.16)", fg: "#2f74c0", dot: PROG, short: "PROG" },
  test: { bg: "rgba(245,181,68,0.18)", fg: "#b8791b", dot: TEST, short: "TEST" },
  done: { bg: "rgba(52,211,106,0.16)", fg: "#1f9d57", dot: DONE, short: "DONE" },
};

type Row = {
  key: string;
  tone: Tone;
  lead: "check" | "story";
  title: string;
  edit?: boolean;
  epic?: { label: string; color: string };
  avatar?: { initials: string; color: string };
};

const ROWS: Row[] = [
  { key: "VPL-29223", tone: "todo", lead: "check", title: "Monitoring Kibana (PROD) & heartbeat channel", epic: { label: "Logging & metrics", color: "#3b82f6" } },
  { key: "VPL-45991", tone: "prog", lead: "story", title: "Auto select correct hotel for BT based on hotel domain", avatar: { initials: "RB", color: "#c08a2b" } },
  { key: "VPL-45948", tone: "prog", lead: "story", title: "Add and remove group codes manually in the bookingtool", epic: { label: "Group Reservations", color: "#db2777" }, avatar: { initials: "VV", color: "#6d4ed6" } },
  { key: "VPL-45943", tone: "test", lead: "story", title: "Restrict booking calendar to group dates to group reservation date range/shoulder", epic: { label: "Group Reservations", color: "#db2777" }, avatar: { initials: "FV", color: "#8b3fd6" } },
  { key: "VPL-46278", tone: "prog", lead: "check", edit: true, title: "ARIE initial sync certification", epic: { label: "ARIE", color: "#16a34a" }, avatar: { initials: "DK", color: "#d63b5b" } },
];

function StatChip({ label, n, tone }: { label: string; n: number; tone: Tone }) {
  const t = TONE[tone];
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.fg }}>
      {label}: {n}
    </span>
  );
}

function BoardBody() {
  return (
    <div className="rounded-b-2xl bg-[var(--color-surface-base)] px-3 pb-3 pt-3">
      <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-floating)] px-3 py-2 ring-1 ring-border-default">
        <Pin className="h-3.5 w-3.5 -rotate-45 text-[var(--color-brand-500)]" strokeWidth={2} fill="currentColor" />
        <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
        <span className="text-[13px] font-semibold text-text-primary">BT: 139</span>
        <span className="rounded-full bg-overlay-default px-2 py-0.5 text-[11px] font-medium text-text-tertiary">21 items</span>
        <span className="flex items-center gap-1 text-[12px] tabular-nums text-text-muted">
          <Hash className="h-3.5 w-3.5" strokeWidth={1.75} />
          27
        </span>
        <span className="flex items-center gap-1 text-[12px] tabular-nums text-[var(--color-brand-500)]">
          <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />
          37
        </span>
        <span className="mx-1 h-4 w-px bg-border-default" />
        <div className="flex items-center gap-1.5">
          <StatChip label="TO DO" n={6} tone="todo" />
          <StatChip label="IN PROGRESS" n={4} tone="prog" />
          <StatChip label="TEST" n={1} tone="test" />
          <StatChip label="DONE" n={8} tone="done" />
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-text-muted">
          <AlertTriangle className="h-4 w-4 text-[#e0892b]" strokeWidth={1.75} />
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
      {ROWS.map((r) => (
        <div key={r.key} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-overlay-subtle">
          {r.lead === "check" ? (
            <CheckSquare className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />
          ) : (
            <Bookmark className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
          )}
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-tertiary">{r.key}</span>
          <span className="flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: TONE[r.tone].bg, color: TONE[r.tone].fg }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[r.tone].dot }} />
            {TONE[r.tone].short}
          </span>
          {r.edit && <SquareArrowOutUpRight className="h-3.5 w-3.5 shrink-0 text-[#3b82f6]" strokeWidth={1.75} />}
          <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{r.title}</span>
          {r.epic && (
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{ color: r.epic.color, borderColor: `color-mix(in srgb, ${r.epic.color} 40%, transparent)`, background: `color-mix(in srgb, ${r.epic.color} 8%, transparent)` }}
            >
              {r.epic.label}
            </span>
          )}
          {r.avatar ? (
            <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: r.avatar.color }}>
              {r.avatar.initials}
            </span>
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full text-text-muted ring-1 ring-border-default">
              <User className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================== page shell = */

export default function TwoRowConsolePage() {
  const [open, setOpen] = useState<"sort" | "filter" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [sortField, setSortField] = useState("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Record<string, string[]>>({ gaps: ["no_points"] });
  const [cols, setCols] = useState<Record<string, boolean>>(COL_DEFAULTS);

  const toggle = (cat: string, opt: string) =>
    setSelected((s) => {
      const cur = s[cat] ?? [];
      const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
      const copy = { ...s };
      if (next.length) copy[cat] = next;
      else delete copy[cat];
      return copy;
    });
  const count = (cat: string) => selected[cat]?.length ?? 0;
  const total = Object.values(selected).reduce((n, a) => n + a.length, 0);
  const filterState: FilterState = {
    selected,
    toggle,
    count,
    total,
    clearAll: () => setSelected({}),
    cols,
    toggleCol: (id) => setCols((c) => ({ ...c, [id]: !c[id] })),
    resetCols: () => setCols(COL_DEFAULTS),
  };

  const sortActive = sortField !== "rank";
  const sortLabel = SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? "Sort";

  const tool =
    "grid h-7 w-7 place-items-center cursor-pointer transition-colors text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary";

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <style>{`@keyframes bridge-blink { 0%, 55% { opacity: 1 } 60%, 95% { opacity: 0.25 } 100% { opacity: 1 } }
        .bridge-caret { animation: bridge-blink 1.5s steps(1, end) infinite; }
        .bc-brand-fg { color: var(--color-brand-600); }`}</style>

      {/* dismiss backdrop for the open sort/filter dropdown */}
      {open && <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(null)} />}

      <div className="mx-auto w-full max-w-[1760px]">
        <header className="mb-9 max-w-3xl">
          <div className="mb-5">
            <Link
              href="/dev/exploration/board-chrome"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Board chrome
            </Link>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
              /dev/exploration/two-row-console
            </p>
            <span className="rounded-full bg-[var(--color-status-done-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">
              Shipped
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">BRDG-344</span>
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Two-row console &mdash; unified controls
          </h1>
          <p className="mt-2 text-body-lg leading-[1.7] text-text-secondary">
            The chosen direction, built out. Two rows: header, then one toolbar whose right side is a single{" "}
            <span className="font-medium text-text-primary">unified controls</span> cluster - search, sort and filter
            together. Filter opens a two-pane dropdown that keeps today&apos;s per-category search and styled option
            badges; the display / field-visibility settings sit behind a button in that dropdown&apos;s header. Sort
            opens its own field + direction menu. It all works - try the cluster on the right.
          </p>
        </header>

        {/* the console */}
        <div className="relative rounded-2xl shadow-[0_28px_80px_-32px_rgba(0,0,0,0.45)] ring-2 ring-[color-mix(in_srgb,var(--color-brand-500)_45%,transparent)]">
          {/* header row */}
          <div className="relative flex items-center gap-3 rounded-t-2xl bg-[var(--color-surface-chrome)] px-5 py-3.5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
            <WordmarkMenu />
            <span className="h-5 w-px bg-border-strong" />
            <SprintContext />
            <div className="ml-auto flex items-center gap-4">
              <FullnessMeter />
              <RightActions />
            </div>
          </div>

          <div className="pointer-events-none h-px w-full bg-gradient-to-r from-transparent via-border-default to-transparent" />

          {/* toolbar row */}
          <div className="relative flex items-center gap-1.5 bg-[var(--color-surface-chrome)] px-5 py-2">
            <AllPill />
            <BacklogsPill />
            <span className="mx-1.5 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
            <SprintPills />

            <div className="ml-auto flex items-center gap-1.5">
              <SavedControl />
              {/* unified controls: search · sort · filter */}
              <div className="flex items-center overflow-visible rounded-lg ring-1 ring-border-default">
                {searchOpen ? (
                  <div className="flex h-7 items-center gap-1.5 px-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
                    <input
                      autoFocus
                      value={searchVal}
                      onChange={(e) => setSearchVal(e.target.value)}
                      placeholder="Search tickets..."
                      className="w-[150px] min-w-0 bg-transparent text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchVal("");
                      }}
                      className="grid h-4 w-4 place-items-center rounded-full text-text-muted hover:text-text-secondary cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSearchOpen(true)}
                    className={`${tool} ${searchVal ? "bc-brand-fg" : ""}`}
                    title="Search tickets"
                  >
                    <Search className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
                <span className="h-5 w-px bg-border-default" />

                {/* sort */}
                <div className={`relative ${open === "sort" ? "z-50" : ""}`}>
                  <button
                    onClick={() => setOpen((o) => (o === "sort" ? null : "sort"))}
                    className={`relative grid h-7 w-7 place-items-center cursor-pointer transition-colors ${
                      sortActive || open === "sort" ? "bc-brand-fg" : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
                    }`}
                    title={sortActive ? `Sorted: ${sortLabel}` : "Sort"}
                  >
                    <ArrowUpDown className="h-4 w-4" strokeWidth={1.75} />
                    {sortActive && <span className="absolute -right-0 -top-0 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
                  </button>
                  {open === "sort" && (
                    <SortPanel
                      field={sortField}
                      dir={sortDir}
                      onChange={(f, d) => {
                        setSortField(f);
                        setSortDir(d);
                      }}
                    />
                  )}
                </div>
                <span className="h-5 w-px bg-border-default" />

                {/* filter */}
                <div className={`relative ${open === "filter" ? "z-50" : ""}`}>
                  <button
                    onClick={() => setOpen((o) => (o === "filter" ? null : "filter"))}
                    className={`flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium cursor-pointer transition-colors ${
                      total > 0 || open === "filter" ? "bc-brand-fg" : "text-text-secondary hover:bg-hover-interactive"
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Filters
                    {total > 0 && <CountBadge n={total} />}
                    <ChevronDown className={`h-3 w-3 text-text-muted transition-transform ${open === "filter" ? "rotate-180" : ""}`} strokeWidth={2} />
                  </button>
                  {open === "filter" && <TwoPanePanel {...filterState} />}
                </div>
              </div>
            </div>
          </div>

          <BoardBody />
        </div>

        {/* anatomy notes */}
        <div className="mt-6 grid max-w-4xl gap-3 sm:grid-cols-3">
          <Note icon={<Search className="h-4 w-4" strokeWidth={1.75} />} title="Search">
            Folded into the cluster as the leading segment; the icon expands inline to a field. No longer a loose
            control on the far left.
          </Note>
          <Note icon={<ArrowUpDown className="h-4 w-4" strokeWidth={1.75} />} title="Sort">
            Opens a field list (Jira rank, Quality, BV, points, ...) with an asc/desc arrow on the active field and a
            reset. A brand dot marks the icon when a non-default sort is on.
          </Note>
          <Note icon={<SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />} title="Filter + Display">
            Two-pane: category rail + options, per-category search and styled badges. The Display button in the header
            swaps the body to the field-visibility settings (Flag, QS, SP, BV, ...) - row display, not table columns.
          </Note>
        </div>

        <footer className="mt-10 max-w-3xl space-y-2 border-t border-border-default pt-5">
          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            Shipped as BRDG-344: unified controls + two-pane, wiring into the real SprintSlots, FilterBar, SortDropdown
            and BoardFieldToggle.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Note({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-floating)] p-3.5 ring-1 ring-border-default">
      <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
        <span className="text-[var(--color-brand-500)]">{icon}</span>
        {title}
      </p>
      <p className="text-[12px] leading-[1.6] text-text-tertiary">{children}</p>
    </div>
  );
}
