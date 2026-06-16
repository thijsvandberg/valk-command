"use client";

/**
 * Throwaway exploration: the three stacked Sprint Board bars as ONE console.
 *
 * Today the header bar (ViewHeader), the views/sprint bar (SprintSlots) and the
 * filter bar (FilterBar) are three flat rows that each carry their own surface,
 * full-width border and rhythm. Stacked, they read as three separate strips
 * rather than one instrument. These directions treat them as a single chrome
 * unit - shared surface system, softened internal seams, one rhythm - while
 * keeping every control that lives there today. Each mock sits over a faithful
 * slice of the real board (group header + ticket rows) so the chrome is judged
 * in context.
 *
 * The header here is already hamburger-less: the bridge_ wordmark is the only
 * menu trigger (the redundant Menu glyph was dropped from the real ViewHeader).
 *
 * Reachable at /dev/exploration/board-chrome; not linked from the app nav.
 */

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
  Columns3,
  ArrowUpDown,
  SlidersHorizontal,
  ListFilter,
  Plus,
  X,
  Pin,
  Hash,
  TrendingUp,
  AlertTriangle,
  CheckSquare,
  HelpCircle,
  SquareArrowOutUpRight,
  User,
} from "lucide-react";

/* ============================================================ shared atoms == */

const GREEN = "#34d36a";
const DONE = "#34d36a";
const TEST = "#f5b544";
const PROG = "#5b9df9";

const SPRINTS = ["BT: 139", "BT: 140", "BT: 141", "BT: 142", "BT: 143", "BT: TODO"];
const FILTERS = ["Status", "Epic", "Assignee", "Readiness", "Changes", "Type", "Gaps", "Team"];

function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span
      className="font-[family-name:var(--font-space-mono)] font-bold lowercase tracking-[-0.02em] text-text-primary"
      style={{ fontSize: size }}
    >
      bridge<span className="bridge-caret text-[var(--color-brand-400)]">_</span>
    </span>
  );
}

/** Wordmark acting as the menu trigger - no hamburger, chevron fades in on hover. */
function WordmarkMenu({ size = 19 }: { size?: number }) {
  return (
    <button
      className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      title="Open navigation"
    >
      <Wordmark size={size} />
      <ChevronDown
        className="h-3.5 w-3.5 -translate-x-1 text-text-muted opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100"
        strokeWidth={2}
      />
    </button>
  );
}

/** Calendar + active sprint key + live dot. */
function SprintContext({ size = 15 }: { size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CalendarRange className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.75} />
      <span className="font-semibold tracking-[-0.01em] text-text-primary" style={{ fontSize: size }}>
        BT: 139
      </span>
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: GREEN, boxShadow: `0 0 7px ${GREEN}` }}
      />
    </div>
  );
}

/** SP / BV / # segmented toggle. */
function ScopeToggle() {
  const seg = (label: string, on?: boolean) => (
    <span
      key={label}
      className={`grid h-5 place-items-center rounded-[6px] px-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
        on ? "bg-overlay-strong text-text-primary" : "text-text-muted"
      }`}
    >
      {label}
    </span>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
      {seg("SP", true)}
      {seg("BV")}
      {seg("#")}
    </div>
  );
}

/** Stacked completion track + status legend + time track - the fullness meter. */
function FullnessMeter({ card }: { card?: boolean }) {
  const legend = (color: string, n: number) => (
    <span className="flex items-center gap-1 text-[11px] tabular-nums text-text-tertiary">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {n}
    </span>
  );
  return (
    <div
      className={`hidden items-center gap-3 lg:flex ${
        card ? "rounded-xl bg-overlay-subtle px-3 py-1.5 ring-1 ring-border-default/70" : ""
      }`}
    >
      <ScopeToggle />
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-1.5 w-[150px] overflow-hidden rounded-full bg-overlay-default">
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
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 w-[60px] overflow-hidden rounded-full bg-overlay-default">
          <div className="absolute inset-y-0 left-0 rounded-full bg-text-muted" style={{ width: "60%" }} />
        </div>
        <span className="text-[12px] tabular-nums text-text-muted">day 6/10</span>
      </div>
    </div>
  );
}

/** Right-side actions: bell (badge 1), search, overflow. */
function RightActions({ ring }: { ring?: boolean }) {
  const btn =
    "group relative grid h-8 w-8 place-items-center rounded-lg cursor-pointer text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";
  return (
    <div className={`flex items-center gap-0.5 ${ring ? "rounded-xl bg-overlay-subtle p-0.5 ring-1 ring-border-default/70" : ""}`}>
      <button className={btn} title="Notifications">
        <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        <span
          className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-[var(--color-surface-chrome)]"
          style={{ background: "#ef4444" }}
        >
          1
        </span>
      </button>
      <button className={btn} title="Search">
        <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
      <button className={btn} title="More">
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/* views-bar building blocks ------------------------------------------------- */

function AllPill({ active = true }: { active?: boolean }) {
  return (
    <span
      className={`grid h-7 place-items-center rounded-lg px-3 text-[13px] font-semibold transition-colors ${
        active ? "bg-[color-mix(in_srgb,var(--color-brand-500)_16%,transparent)] bc-brand-fg" : "text-text-tertiary"
      }`}
    >
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

/** Right-side view tools: Saved / columns / sort / filter toggle. */
function ViewTools({ filterActive = true }: { filterActive?: boolean }) {
  const tool =
    "grid h-7 w-7 place-items-center rounded-lg cursor-pointer text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary";
  return (
    <div className="flex items-center gap-1">
      <span className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-text-secondary">
        <Bookmark className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        Saved
        <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
      </span>
      <button className={tool} title="Columns">
        <Columns3 className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button className={tool} title="Sort">
        <ArrowUpDown className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        className={`relative grid h-7 w-7 place-items-center rounded-lg cursor-pointer transition-colors ${
          filterActive
            ? "bg-[color-mix(in_srgb,var(--color-brand-500)_16%,transparent)] bc-brand-fg ring-1 ring-[color-mix(in_srgb,var(--color-brand-500)_45%,transparent)]"
            : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
        }`}
        title="Filters"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
        {filterActive && (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
        )}
      </button>
    </div>
  );
}

/* filter-bar building blocks ------------------------------------------------ */

function FilterChip({ label, count, ghost }: { label: string; count?: number; ghost?: boolean }) {
  const active = count != null;
  return (
    <span
      className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-[color-mix(in_srgb,var(--color-brand-500)_15%,transparent)] bc-brand-fg"
          : ghost
            ? "text-text-secondary hover:bg-hover-interactive"
            : "text-text-secondary ring-1 ring-border-default hover:bg-hover-interactive"
      }`}
    >
      {label}
      {active && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_35%,transparent)] px-1 text-[10px] font-bold bc-brand-fg">
          {count}
        </span>
      )}
      <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
    </span>
  );
}

function FilterSearch() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary cursor-pointer">
      <Search className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}

function ClearChip() {
  return (
    <span className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-primary cursor-pointer">
      <X className="h-3 w-3" strokeWidth={2} />
      Clear
    </span>
  );
}

function SaveViewButton() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary cursor-pointer" title="Save view">
      <Bookmark className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}

/** A soft inset divider: a hairline that fades at both ends instead of a hard
    full-width rule, so stacked bars share one surface rather than reading as
    separate strips. */
function SeamSoft() {
  return <div className="pointer-events-none h-px w-full bg-gradient-to-r from-transparent via-border-default to-transparent" />;
}

/* ===================================================== faux board content == */

type Tone = "todo" | "prog" | "test" | "done";
const TONE: Record<Tone, { bg: string; fg: string; dot: string; short: string }> = {
  todo: { bg: "rgba(113,113,122,0.12)", fg: "#6b7280", dot: "#9ca3af", short: "TODO" },
  prog: { bg: "rgba(91,157,249,0.16)", fg: "#2f74c0", dot: PROG, short: "PROG" },
  test: { bg: "rgba(245,181,68,0.18)", fg: "#b8791b", dot: TEST, short: "TEST" },
  done: { bg: "rgba(52,211,106,0.16)", fg: "#1f9d57", dot: DONE, short: "DONE" },
};

function RowStatus({ tone }: { tone: Tone }) {
  const t = TONE[tone];
  return (
    <span
      className="flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {t.short}
    </span>
  );
}

function StatChip({ label, n, tone }: { label: string; n: number; tone: Tone }) {
  const t = TONE[tone];
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.fg }}>
      {label}: {n}
    </span>
  );
}

function EpicPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      {label}
    </span>
  );
}

function Avatar({ initials, color }: { initials?: string; color?: string }) {
  if (!initials)
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-border-default text-text-muted">
        <User className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    );
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
      {initials}
    </span>
  );
}

type Row = {
  key: string;
  tone: Tone;
  lead: "check" | "story" | "q";
  title: string;
  edit?: boolean;
  warn?: number;
  epic?: { label: string; color: string };
  avatar?: { initials: string; color: string };
};

const ROWS: Row[] = [
  { key: "VPL-29223", tone: "todo", lead: "check", title: "Monitoring Kibana (PROD) & heartbeat channel", epic: { label: "Logging & metrics", color: "#3b82f6" } },
  { key: "VPL-45991", tone: "prog", lead: "story", title: "Auto select correct hotel for BT based on hotel domain", avatar: { initials: "RB", color: "#c08a2b" } },
  { key: "VPL-45948", tone: "prog", lead: "story", title: "Add and remove group codes manually in the bookingtool", epic: { label: "Group Reservations", color: "#db2777" }, avatar: { initials: "VV", color: "#6d4ed6" } },
  { key: "VPL-45943", tone: "test", lead: "story", title: "Restrict booking calendar to group dates to group reservation date range/shoulder", epic: { label: "Group Reservations", color: "#db2777" }, avatar: { initials: "FV", color: "#8b3fd6" } },
  { key: "VPL-36166", tone: "prog", lead: "story", title: "Configurable maximum booking period per hotel (12-24 months)", epic: { label: "BT: Dates / Calendar (availability)", color: "#e11d48" }, avatar: { initials: "RB", color: "#c08a2b" } },
  { key: "VPL-46278", tone: "prog", lead: "check", edit: true, title: "ARIE initial sync certification", epic: { label: "ARIE", color: "#16a34a" }, avatar: { initials: "DK", color: "#d63b5b" } },
];

function LeadIcon({ kind }: { kind: Row["lead"] }) {
  if (kind === "check") return <CheckSquare className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />;
  if (kind === "q") return <HelpCircle className="h-4 w-4 text-[#e0892b]" strokeWidth={1.75} />;
  return <Bookmark className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />;
}

/** A faithful slice of the live board so each chrome direction is judged in
    context. `accent` draws a brand left-edge on the group header (variant E). */
function BoardBody({ accent }: { accent?: boolean }) {
  return (
    <div className="bg-[var(--color-surface-base)] px-3 pb-3 pt-3">
      {/* group header */}
      <div
        className="mb-1 flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-floating)] px-3 py-2 ring-1 ring-border-default"
        style={accent ? { borderLeft: "3px solid var(--color-brand-400)" } : undefined}
      >
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
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>

      {/* ticket rows */}
      <div>
        {ROWS.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-overlay-subtle"
          >
            <LeadIcon kind={r.lead} />
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-tertiary">{r.key}</span>
            <RowStatus tone={r.tone} />
            {r.edit && <SquareArrowOutUpRight className="h-3.5 w-3.5 shrink-0 text-[#3b82f6]" strokeWidth={1.75} />}
            {r.warn != null && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-[rgba(245,181,68,0.18)] px-1 text-[10px] font-semibold text-[#b8791b]">
                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                {r.warn}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{r.title}</span>
            {r.epic && <EpicPill label={r.epic.label} color={r.epic.color} />}
            <Avatar initials={r.avatar?.initials} color={r.avatar?.color} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The outer screen frame shared by every mock; optional full-height brand spine. */
function Screen({ children, spine }: { children: React.ReactNode; spine?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-border-strong shadow-[0_28px_80px_-32px_rgba(0,0,0,0.45)]">
      {spine && (
        <span
          className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-[3px]"
          style={{ background: "linear-gradient(to bottom, var(--color-brand-400), var(--color-brand-700))" }}
        />
      )}
      {children}
    </div>
  );
}

/* ================================================================ TODAY ==== */
/* Faithful recreation of the current three flat rows. */

function TodayBars() {
  return (
    <>
      <div className="relative flex items-center gap-3 border-b border-border-strong bg-[var(--color-surface-chrome)] px-5 py-3.5">
        <WordmarkMenu />
        <span className="h-5 w-px bg-border-strong" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border-default bg-[var(--color-surface-base)] px-5 py-2">
        <AllPill />
        <BacklogsPill />
        <span className="mx-1 h-5 w-px bg-border-default" />
        {SPRINTS.map((s, i) => (
          <span
            key={s}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ${
              i === 0
                ? "border-b-2 border-[var(--color-brand-400)] font-semibold text-text-primary"
                : "font-medium text-text-tertiary"
            }`}
          >
            {i === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />}
            {s}
          </span>
        ))}
        <div className="ml-auto">
          <ViewTools />
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border-default bg-[var(--color-surface-base)] px-5 py-2">
        <FilterSearch />
        <span className="h-5 w-px bg-border-default" />
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} count={f === "Gaps" ? 1 : undefined} />
        ))}
        <ClearChip />
        <div className="ml-auto">
          <SaveViewButton />
        </div>
      </div>
    </>
  );
}

/* ========================================================= A · UNIFIED ===== */
/* One continuous elevated slab. No full-width borders between bars - hairline
   inset seams that fade at the ends. Filter chips go ghost (no ring) so the
   busiest row reads as quiet text. A left brand glow anchors the whole stack. */

function VariantA() {
  return (
    <div className="relative bg-[var(--color-surface-chrome)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-80 bg-[radial-gradient(ellipse_at_left_top,color-mix(in_srgb,var(--color-brand-500)_12%,transparent)_0%,transparent_68%)]" />

      <div className="relative flex items-center gap-3 px-5 py-3.5">
        <WordmarkMenu />
        <span className="h-5 w-px bg-gradient-to-b from-transparent via-border-strong to-transparent" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4">
          <FullnessMeter />
          <RightActions ring />
        </div>
      </div>

      <SeamSoft />

      <div className="relative flex items-center gap-1.5 px-5 py-2">
        <AllPill />
        <BacklogsPill />
        <span className="mx-1.5 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
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
        <div className="ml-auto">
          <ViewTools />
        </div>
      </div>

      <SeamSoft />

      <div className="relative flex items-center gap-1 px-5 py-2">
        <FilterSearch />
        <span className="mx-1 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} count={f === "Gaps" ? 1 : undefined} ghost />
        ))}
        <ClearChip />
        <div className="ml-auto">
          <SaveViewButton />
        </div>
      </div>
    </div>
  );
}

/* ========================================================= B · FLOATING ==== */
/* A recessed console base (inset shadow) with three floating control cards. The
   air between cards replaces every border. The sprint tabs become one segmented
   control with a raised active pill; filters sit in their own floating tray. */

function FloatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-floating)] px-3 py-1.5 ring-1 ring-border-default shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)]">
      {children}
    </div>
  );
}

function VariantB() {
  return (
    <div className="bg-[var(--color-surface-base)] p-2.5" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.18)" }}>
      <div className="flex flex-col gap-2">
        <FloatRow>
          <div className="flex items-center gap-2.5 pl-1">
            <WordmarkMenu />
            <span className="h-5 w-px bg-border-strong" />
            <SprintContext />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <FullnessMeter />
            <RightActions />
          </div>
        </FloatRow>

        <FloatRow>
          <AllPill />
          <BacklogsPill />
          <span className="mx-1 h-5 w-px bg-border-default" />
          <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
            {SPRINTS.map((s, i) => (
              <span
                key={s}
                className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors cursor-pointer ${
                  i === 0
                    ? "bg-[var(--color-surface-floating)] font-semibold text-text-primary shadow-[0_1px_3px_-1px_rgba(0,0,0,0.5)]"
                    : "font-medium text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {i === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />}
                {s}
              </span>
            ))}
          </div>
          <div className="ml-auto">
            <ViewTools />
          </div>
        </FloatRow>

        <FloatRow>
          <FilterSearch />
          <span className="mx-0.5 h-5 w-px bg-border-default" />
          {FILTERS.map((f) => (
            <FilterChip key={f} label={f} count={f === "Gaps" ? 1 : undefined} ghost />
          ))}
          <ClearChip />
          <div className="ml-auto">
            <SaveViewButton />
          </div>
        </FloatRow>
      </div>
    </div>
  );
}

/* ========================================================= C · EDITORIAL === */
/* A left brand rail spans the chrome. The header breathes more, the meter moves
   into its own card, sprint tabs go small-caps with a thin active underline, and
   the filter row leads with a "Filters - 1 active" summary so the chips read as
   a considered set, not noise. */

function VariantC() {
  return (
    <div className="relative flex">
      <span
        className="w-[3px] shrink-0"
        style={{ background: "linear-gradient(to bottom, var(--color-brand-400), var(--color-brand-700))" }}
      />
      <div className="min-w-0 flex-1 bg-[var(--color-surface-chrome)]">
        <div className="flex items-center gap-4 px-6 py-4">
          <WordmarkMenu size={20} />
          <span className="h-6 w-px bg-border-strong" />
          <SprintContext size={16} />
          <div className="ml-auto flex items-center gap-4">
            <FullnessMeter card />
            <RightActions />
          </div>
        </div>

        <div className="h-px w-full bg-border-default" />

        <div className="flex items-center gap-5 bg-[var(--color-surface-base)] px-6 py-2.5">
          <span className="bc-brand-fg text-[11px] font-semibold uppercase tracking-[0.16em]">All</span>
          <BacklogsPill />
          <span className="h-5 w-px bg-border-default" />
          <div className="flex items-center gap-5">
            {SPRINTS.map((s, i) => (
              <span
                key={s}
                className={`relative cursor-pointer pb-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  i === 0 ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {s}
                {i === 0 && <span className="absolute -bottom-[11px] left-0 right-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
              </span>
            ))}
          </div>
          <div className="ml-auto">
            <ViewTools />
          </div>
        </div>

        <div className="h-px w-full bg-border-default" />

        <div className="flex items-center gap-2.5 bg-[var(--color-surface-base)] px-6 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <ListFilter className="h-3.5 w-3.5" strokeWidth={1.75} />
            Filters
            <span className="rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_18%,transparent)] px-2 py-0.5 text-[10px] tracking-normal bc-brand-fg">
              1 active
            </span>
          </span>
          <span className="h-5 w-px bg-border-default" />
          {FILTERS.map((f) => (
            <FilterChip key={f} label={f} count={f === "Gaps" ? 1 : undefined} ghost />
          ))}
          <ClearChip />
          <div className="ml-auto flex items-center gap-1">
            <FilterSearch />
            <SaveViewButton />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================= D · TWO-ROW ===== */
/* Collapses three rows into two. The views/sprint bar and filter bar merge into
   one toolbar: scopes + sprint pills on the left, view tools and a single
   "Filters - 1" trigger on the right (the chips live in a popover, shown open as
   a tray). Shortest, calmest chrome - the most height the board ever gets back. */

function VariantD() {
  return (
    <div className="relative bg-[var(--color-surface-chrome)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />

      <div className="relative flex items-center gap-3 px-5 py-3.5">
        <WordmarkMenu />
        <span className="h-5 w-px bg-border-strong" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4">
          <FullnessMeter />
          <RightActions ring />
        </div>
      </div>

      <SeamSoft />

      {/* merged toolbar */}
      <div className="relative flex items-center gap-1.5 px-5 py-2">
        <AllPill />
        <BacklogsPill />
        <span className="mx-1.5 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
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
        <div className="ml-auto flex items-center gap-1">
          {/* the whole filter row, folded into one trigger */}
          <span className="flex h-7 items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--color-brand-500)_15%,transparent)] px-2.5 text-[12px] font-medium bc-brand-fg ring-1 ring-[color-mix(in_srgb,var(--color-brand-500)_40%,transparent)] cursor-pointer">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            Filters
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_35%,transparent)] px-1 text-[10px] font-bold bc-brand-fg">
              1
            </span>
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          </span>
          <span className="mx-0.5 h-5 w-px bg-border-default" />
          <span className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-text-secondary cursor-pointer">
            <Bookmark className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
            Saved
            <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
          </span>
          <button className="grid h-7 w-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary cursor-pointer" title="Columns">
            <Columns3 className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button className="grid h-7 w-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-interactive hover:text-text-secondary cursor-pointer" title="Sort">
            <ArrowUpDown className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ E · SPINE ===== */
/* The unified slab, but a single teal spine runs the full height - through the
   header, views and filter rows AND down into the board, where the active
   sprint's group header picks up the same brand left-edge. The whole active
   column reads as one continuous instrument from chrome into content. */

function VariantE() {
  return (
    <div className="relative bg-[var(--color-surface-chrome)] pl-[3px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />

      <div className="relative flex items-center gap-3 px-5 py-3.5">
        <WordmarkMenu />
        <span className="h-5 w-px bg-gradient-to-b from-transparent via-border-strong to-transparent" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4">
          <FullnessMeter />
          <RightActions ring />
        </div>
      </div>

      <SeamSoft />

      <div className="relative flex items-center gap-1.5 px-5 py-2">
        <AllPill />
        <BacklogsPill />
        <span className="mx-1.5 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
        {SPRINTS.map((s, i) => (
          <span
            key={s}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors cursor-pointer ${
              i === 0
                ? "bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] font-semibold bc-brand-fg ring-1 ring-[color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]"
                : "font-medium text-text-tertiary hover:bg-hover-interactive"
            }`}
          >
            {i === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />}
            {s}
          </span>
        ))}
        <div className="ml-auto">
          <ViewTools />
        </div>
      </div>

      <SeamSoft />

      <div className="relative flex items-center gap-1 px-5 py-2">
        <FilterSearch />
        <span className="mx-1 h-5 w-px bg-gradient-to-b from-transparent via-border-default to-transparent" />
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} count={f === "Gaps" ? 1 : undefined} ghost />
        ))}
        <ClearChip />
        <div className="ml-auto">
          <SaveViewButton />
        </div>
      </div>
    </div>
  );
}

/* ============================================================== page shell = */

type Spec = {
  id: string;
  title: string;
  surface: string;
  seam: string;
  blurb: string;
  Render: () => React.ReactNode;
  spine?: boolean;
};

const VARIANTS: Spec[] = [
  {
    id: "A",
    title: "Unified slab",
    surface: "One chrome surface",
    seam: "Faded hairline seams",
    blurb:
      "All three bars share a single elevated surface; the hard full-width borders become hairline seams that fade at the ends, so the stack reads as one instrument. Filter chips drop their rings to go quiet, and a left brand glow anchors the whole console. The lowest-risk, calmest step from today.",
    Render: VariantA,
  },
  {
    id: "B",
    title: "Floating clusters",
    surface: "Recessed base + cards",
    seam: "Air, no borders",
    blurb:
      "A recessed console base holds three floating control cards - the air between them replaces every divider. The sprint tabs become one segmented switcher with a raised active pill, and the filter chips sit in their own tray. Reads as a tactile instrument panel; the boldest restyle.",
    Render: VariantB,
  },
  {
    id: "C",
    title: "Editorial rail",
    surface: "Brand rail + airy rows",
    seam: "Thin keyline + whitespace",
    blurb:
      "A vertical teal rail (the underscore stretched down the side) carries the brand across the chrome. Rows breathe more, the meter gets its own card, sprint tabs go small-caps with a thin active underline, and the filter row opens with a 'Filters - 1 active' summary so the chips read as a curated set. The most refined direction.",
    Render: VariantC,
  },
  {
    id: "D",
    title: "Two-row console",
    surface: "Header + merged toolbar",
    seam: "One seam, fewer rows",
    blurb:
      "Chosen direction. Collapses three rows into two: the views/sprint bar and the filter bar merge into one toolbar. Scopes and sprint pills sit on the left; the entire filter row folds into a single 'Filters - 1' trigger (chips open in a popover) alongside the view tools on the right. The shortest chrome - hands the most height back to the board. Built out in /dev/exploration/two-row-console and spec'd as BRDG-344.",
    Render: VariantD,
  },
  {
    id: "E",
    title: "Brand spine",
    surface: "Continuous into content",
    seam: "Spine ties chrome to board",
    blurb:
      "The unified slab, but one teal spine runs the full height - through every bar and down into the board, where the active sprint's group header picks up the same brand left-edge. The active column reads as one continuous instrument from chrome into content; the strongest tie between the bars and what they control.",
    Render: VariantE,
    spine: true,
  },
];

function Tag({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay-subtle px-2.5 py-1 ring-1 ring-border-default">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</span>
      <span className={`text-[11px] font-medium ${accent ? "text-[var(--color-brand-300)]" : "text-text-secondary"}`}>
        {value}
      </span>
    </span>
  );
}

export default function BoardChromeExplorationPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <style>{`@keyframes bridge-blink { 0%, 55% { opacity: 1 } 60%, 95% { opacity: 0.25 } 100% { opacity: 1 } }
        .bridge-caret { animation: bridge-blink 1.5s steps(1, end) infinite; }
        /* Active brand text on a pale tint - matches the live board's active pills. */
        .bc-brand-fg { color: var(--color-brand-600); }`}</style>

      <div className="mx-auto w-full max-w-[1760px]">
        <header className="mb-9 max-w-3xl">
          <div className="mb-5">
            <Link
              href="/dev/exploration"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              All explorations
            </Link>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
              /dev/exploration/board-chrome
            </p>
            <span className="rounded-full bg-overlay-default px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
              Chosen
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">BRDG-344</span>
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Header, sprint &amp; filter bars
          </h1>
          <p className="mt-2 text-body-lg leading-[1.7] text-text-secondary">
            Today the three stacked board bars - header, views/sprint, filter - each carry their own surface,
            full-width border and rhythm, so they read as three separate strips. These directions treat them as one
            console: shared surface, softened seams, one rhythm, every control kept. Each mock sits over a real slice of
            the board so the chrome is judged in context. The header is already hamburger-less - the{" "}
            <span className="font-[family-name:var(--font-space-mono)] font-bold">
              bridge<span className="text-[var(--color-brand-400)]">_</span>
            </span>{" "}
            wordmark is the only menu trigger.
          </p>
        </header>

        {/* current reference */}
        <section className="mb-12">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span className="h-px w-6 bg-border-strong" /> Today
          </p>
          <Screen>
            <TodayBars />
            <BoardBody />
          </Screen>
          <p className="mt-2.5 max-w-3xl text-body-sm leading-[1.6] text-text-tertiary">
            Three flat rows with full-width borders between them. The hamburger is gone; the meter, sprint tabs and
            filter chips are unchanged from the live board.
          </p>
        </section>

        {/* variants */}
        <div className="space-y-14">
          {VARIANTS.map(({ id, title, surface, seam, blurb, Render, spine }) => (
            <section key={id}>
              <div className="mb-3.5 flex flex-wrap items-center gap-3">
                <span
                  className="grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold bc-brand-fg"
                  style={{ background: "color-mix(in srgb, var(--color-brand-500) 18%, transparent)" }}
                >
                  {id}
                </span>
                <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
                <Tag label="Surface" value={surface} accent />
                <Tag label="Seams" value={seam} />
              </div>
              <Screen spine={spine}>
                <Render />
                <BoardBody accent={spine} />
              </Screen>
              <p className="mt-3 max-w-3xl text-body-sm leading-[1.65] text-text-tertiary">{blurb}</p>
            </section>
          ))}
        </div>

        <footer className="mt-14 max-w-3xl space-y-2 border-t border-border-default pt-5">
          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            Chosen: D (two-row console) &mdash; built out in /dev/exploration/two-row-console and spec&apos;d as BRDG-344.
          </p>
          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Board rows and the menu, sort and filter controls are styling-only here.
          </p>
        </footer>
      </div>
    </div>
  );
}
