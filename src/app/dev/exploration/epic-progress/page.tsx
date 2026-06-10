"use client";

/**
 * Throwaway exploration: epic progress summary (EpicStatsSummary) rework.
 *
 * Two realities reshape this since the first pass:
 *   1. The MOST-USED view is the grouped-by-sprint list (GroupStatBar headers like
 *      "BT: 138 · 4 items · # 7 · ↗ 10 · CLOSED · 22 May - 4 Jun" with ChildIssueRow
 *      rows). The epic roll-up sits ABOVE those sprint cards, so it must read as the
 *      "all sprints combined" total and not compete with each group's own roll-up.
 *   2. Child issues now live on their OWN tab. The tab bar already says "Child issues",
 *      so the separate "Child Issues  22 of 26  ⋯" section header is a redundant repeat.
 *      Its useful parts (the 22-of-26 count and the ⋯ actions menu) need a home; the
 *      literal title does not.
 *
 * So the job is no longer "restyle a floating card" - it is "fold the redundant section
 * header into a single, legible tab header that introduces the grouped sprint list".
 * Four directions below, each rendered as a full tab (faux tab strip + summary + a real
 * grouped sprint mock). The live problems carried over: two unlabelled number systems
 * and a bare "27%" with no stated meaning.
 *
 * Show/hide: each SPRINT GROUP keeps its own collapse chevron (that replaces the old
 * section-level collapse); the summary itself is shown/hidden via the ⋯ menu's "Hide
 * progress summary", a shared preference (localStorage in the real app).
 *
 * Reachable at /dev/exploration/epic-progress. Not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, MoreHorizontal, Eye, EyeOff, Bookmark, CalendarRange } from "lucide-react";
import { StatusPill, StatPill, STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Tooltip } from "@/components/shared/Tooltip";

type Status = "TO DO" | "IN PROGRESS" | "TEST" | "DONE";
type Metric = "items" | "sp" | "bv";

// Self-consistent sample matching the screenshot's headline numbers
// (22 items, 18 SP, 37 BV; 26 children with 4 deprecated hidden -> "22 of 26").
const SAMPLE: Record<Metric, Record<Status, number>> = {
  items: { "TO DO": 15, "IN PROGRESS": 2, TEST: 0, DONE: 5 },
  sp: { "TO DO": 11, "IN PROGRESS": 3, TEST: 0, DONE: 4 },
  bv: { "TO DO": 22, "IN PROGRESS": 5, TEST: 0, DONE: 10 },
};
const TOTAL_CHILDREN = 26;
const SHOWN = 22;
const SPRINT_COUNT = 4;

const DISTRIBUTION: Status[] = ["TO DO", "IN PROGRESS", "TEST", "DONE"];
const SEGMENTS: Status[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];
const METRICS: { key: Metric; label: string }[] = [
  { key: "items", label: "items" },
  { key: "sp", label: "SP" },
  { key: "bv", label: "BV" },
];

const color = (s: Status) => STATUS_PILL_COLORS[s].dot ?? STATUS_PILL_COLORS[s].text;
const total = (m: Metric) => DISTRIBUTION.reduce((a, s) => a + SAMPLE[m][s], 0);
const donePct = (m: Metric) => Math.round((SAMPLE[m].DONE / total(m)) * 100);
const metricLabel = (m: Metric) => METRICS.find((x) => x.key === m)!.label;
const lower: Record<Status, string> = {
  "TO DO": "to do",
  "IN PROGRESS": "in progress",
  TEST: "test",
  DONE: "done",
};

const PANEL =
  "rounded-2xl border border-border-subtle bg-[var(--color-surface-elevated)] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.10)]";
const MENU =
  "absolute right-0 top-9 z-20 w-60 rounded-xl border border-border-subtle bg-[var(--color-surface-floating)] p-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5),0_0_0_1px_var(--color-border-strong)]";

// ── Summary primitives ────────────────────────────────────────────────────────

// Segmented bar where each colour is its own hover target. Hovering a segment
// reveals a styled tooltip with that status, its count for the active metric and
// its share of the total — so the breakdown lives on demand instead of as a row
// of standing labels.
function SegBar({ metric, height = 8 }: { metric: Metric; height?: number }) {
  const t = total(metric);
  return (
    <div
      className="flex flex-1 overflow-hidden rounded-full bg-overlay-subtle"
      style={{ height }}
      role="progressbar"
      aria-valuenow={donePct(metric)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${metricLabel(metric)} completion`}
    >
      {SEGMENTS.map((s) => {
        const v = SAMPLE[metric][s];
        if (v <= 0) return null;
        const segPct = Math.round((v / t) * 100);
        return (
          <div
            key={s}
            className="flex min-w-0"
            style={{ width: `${(v / t) * 100}%`, transition: "width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            <Tooltip
              delay={120}
              className="w-full"
              content={
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color(s) }} />
                  <span className="font-semibold">
                    {v} {metricLabel(metric)}
                  </span>
                  <span className="text-text-muted">
                    {lower[s]} · {segPct}%
                  </span>
                </span>
              }
            >
              <span className="block w-full cursor-default" style={{ height, backgroundColor: color(s) }} />
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

function MetricToggle({
  metric,
  setMetric,
  withTotals = false,
}: {
  metric: Metric;
  setMetric: (m: Metric) => void;
  withTotals?: boolean;
}) {
  return (
    <div className="inline-flex items-stretch rounded-xl border border-border-subtle bg-overlay-subtle p-0.5">
      {METRICS.map((m) => {
        const active = metric === m.key;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={active}
            onClick={() => setMetric(m.key)}
            className={`inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 cursor-pointer transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
              active
                ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)] text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {withTotals && (
              <span className="font-display text-body-lg font-semibold leading-none tracking-[-0.02em] tabular-nums">
                {total(m.key)}
              </span>
            )}
            <span className="text-caption font-medium uppercase tracking-wide">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Replaces the loud uppercase "TO DO: 15 / IN PROGRESS: 2 / DONE: 5" pills with a
// calm, clickable breakdown: a colour dot (same hue as the bar) + the count + a
// quiet lowercase word. Doubles as the status filter; counts follow the metric.
// `size="lg"` is the standalone treatment under the bar; "sm" is the inline form.
function Breakdown({
  metric,
  filter,
  setFilter,
  size = "lg",
}: {
  metric: Metric;
  filter: Status | null;
  setFilter: (s: Status | null) => void;
  size?: "lg" | "sm";
}) {
  const lg = size === "lg";
  return (
    <div className={`flex flex-wrap items-center ${lg ? "gap-x-2 gap-y-1.5" : "gap-x-1 gap-y-1"}`}>
      {SEGMENTS.filter((s) => SAMPLE[metric][s] > 0).map((s) => {
        const active = filter === s;
        const dimmed = filter !== null && !active;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(active ? null : s)}
            aria-pressed={active}
            className={`inline-flex items-center rounded-lg cursor-pointer tabular-nums transition-[background-color,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
              lg ? "gap-2 px-2 py-1 text-body-lg" : "gap-1.5 px-1.5 py-0.5 text-body-sm"
            } ${active ? "bg-overlay-default" : "hover:bg-overlay-subtle"} ${dimmed ? "opacity-45 hover:opacity-100" : ""}`}
          >
            <span className={`shrink-0 rounded-full ${lg ? "h-2.5 w-2.5" : "h-2 w-2"}`} style={{ backgroundColor: color(s) }} />
            <span className="font-semibold text-text-primary">{SAMPLE[metric][s]}</span>
            <span className="text-text-muted">{lower[s]}</span>
          </button>
        );
      })}
    </div>
  );
}

function CountBadge() {
  return (
    <span className="rounded-full bg-overlay-default px-2.5 py-1 text-body-sm font-medium tabular-nums text-text-tertiary">
      {SHOWN} of {TOTAL_CHILDREN}
    </span>
  );
}

// The ⋯ menu now owns what the redundant section header used to: the section
// actions plus the show/hide-summary preference.
function DotsMenu({ hidden, setHidden }: { hidden: boolean; setHidden: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm cursor-pointer transition-colors duration-150";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-hover-list-item hover:text-text-secondary cursor-pointer transition-colors duration-150"
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={MENU}>
            {["New child issue", "View: by sprint", "Filter", "Columns"].map((label) => (
              <span key={label} className={`${item} text-text-secondary`}>
                {label}
              </span>
            ))}
            <div className="my-1 h-px bg-border-subtle" />
            <button
              type="button"
              onClick={() => {
                setHidden(!hidden);
                setOpen(false);
              }}
              className={`${item} text-text-secondary hover:bg-hover-list-item hover:text-text-primary`}
            >
              {hidden ? <Eye size={14} strokeWidth={1.5} /> : <EyeOff size={14} strokeWidth={1.5} />}
              <span>{hidden ? "Show progress summary" : "Hide progress summary"}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Grouped sprint view mock (the most-used list) ─────────────────────────────

type Row = { key: string; status: Status; title: string; sp: number; bv: number };
type Group = { label: string; state: "CLOSED" | "ACTIVE"; dateRange: string; sp: number; bv: number; rows: Row[] };

const GROUPS: Group[] = [
  {
    label: "BT: 138",
    state: "CLOSED",
    dateRange: "22 May - 4 Jun",
    sp: 7,
    bv: 10,
    rows: [
      { key: "VPL-45730", status: "DONE", title: 'Display "Group Code" card with group details below search widget', sp: 2, bv: 3 },
      { key: "VPL-45731", status: "DONE", title: "Scope room availability and pricing to group block in /rooms call", sp: 2, bv: 3 },
      { key: "VPL-45732", status: "IN PROGRESS", title: "Wire group block selection into the booking summary", sp: 3, bv: 4 },
    ],
  },
  {
    label: "BT: 139",
    state: "ACTIVE",
    dateRange: "5 Jun - 18 Jun",
    sp: 3,
    bv: 3,
    rows: [
      { key: "VPL-45740", status: "TO DO", title: "Persist the selected group across a page reload", sp: 2, bv: 2 },
      { key: "VPL-45741", status: "TO DO", title: "Add a group-rate badge to the results list", sp: 1, bv: 1 },
    ],
  },
];

function StatePill({ state }: { state: Group["state"] }) {
  const active = state === "ACTIVE";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={
        active
          ? { backgroundColor: STATUS_PILL_COLORS.DONE.bg, color: STATUS_PILL_COLORS.DONE.text }
          : { backgroundColor: "var(--color-overlay-subtle)", color: "var(--color-text-muted)" }
      }
    >
      {active && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color("DONE") }} />}
      {state}
    </span>
  );
}

function ChildRow({ row, last }: { row: Row; last: boolean }) {
  return (
    <div className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-hover-list-item ${last ? "" : "border-b border-border-subtle"}`}>
      <Bookmark size={16} strokeWidth={1.5} className="shrink-0 text-text-muted" />
      <span className="shrink-0 font-mono text-body-sm text-text-secondary">{row.key}</span>
      <StatusPill size="badge" colorKey={row.status} label={row.status} showDot />
      <span className="min-w-0 flex-1 truncate text-[15px] text-text-primary">{row.title}</span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <MetricBadge metric="sp" value={row.sp} tinted />
        <MetricBadge metric="bv" value={row.bv} tinted />
      </div>
    </div>
  );
}

function SprintGroup({ group }: { group: Group }) {
  const [collapsed, setCollapsed] = useState(group.state === "CLOSED");
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle">
      <div className="flex flex-wrap items-center gap-2.5 bg-overlay-subtle px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-text-muted hover:text-text-secondary cursor-pointer transition-colors duration-150"
        >
          <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        <span className="text-body-lg font-medium text-text-primary">{group.label}</span>
        <StatPill size="sm">{group.rows.length} items</StatPill>
        <MetricBadge metric="sp" value={group.sp} tinted />
        <MetricBadge metric="bv" value={group.bv} tinted />
        <div className="ml-auto flex items-center gap-2">
          <StatePill state={group.state} />
          <span className="inline-flex items-center gap-1 text-caption tabular-nums text-text-muted">
            <CalendarRange size={13} strokeWidth={1.5} />
            {group.dateRange}
          </span>
        </div>
      </div>
      {!collapsed && (
        <div>
          {group.rows.map((r, i) => (
            <ChildRow key={r.key} row={r} last={i === group.rows.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupedView() {
  return (
    <div className="flex flex-col gap-3.5 px-4 pb-4 pt-2">
      {GROUPS.map((g) => (
        <SprintGroup key={g.label} group={g} />
      ))}
    </div>
  );
}

// The tab strip the page already shows: it makes the "Child Issues" section title
// below it a literal repeat, which is why the variants drop that title.
function FauxTabs() {
  const tabs = ["Child issues", "Content", "Activity", "Links"];
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle px-4 pt-2">
      {tabs.map((t, i) => (
        <span
          key={t}
          className={`relative px-3 py-2.5 text-body-lg ${i === 0 ? "font-medium text-text-primary" : "text-text-muted"}`}
        >
          {t}
          {i === 0 && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-brand-400)]" />}
        </span>
      ))}
    </div>
  );
}

// ── State contract shared across variants ─────────────────────────────────────
type Shared = {
  metric: Metric;
  setMetric: (m: Metric) => void;
  filter: Status | null;
  setFilter: (s: Status | null) => void;
  hidden: boolean;
  setHidden: (v: boolean) => void;
};

const Sentence = ({ metric }: { metric: Metric }) => (
  <span className="shrink-0 text-body-lg text-text-secondary tabular-nums">
    <span className="font-semibold text-text-primary">
      {SAMPLE[metric].DONE} of {total(metric)} {metricLabel(metric)}
    </span>{" "}
    done · <span className="font-display font-semibold text-text-primary">{donePct(metric)}%</span>
  </span>
);

// ── Variant A — Consolidated tab header (recommended) ─────────────────────────
// Drops the redundant "Child Issues" title. The roll-up becomes the tab header:
// count + filter pills + metric toggle + the ⋯ actions, with a sentence-labelled
// bar that says what the % means. Sits directly above the sprint groups.
function VariantA(s: Shared) {
  return (
    <section className={PANEL}>
      <FauxTabs />
      {!s.hidden && (
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
            <CountBadge />
            <div className="flex items-center gap-2">
              <MetricToggle metric={s.metric} setMetric={s.setMetric} />
              <DotsMenu hidden={s.hidden} setHidden={s.setHidden} />
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <SegBar metric={s.metric} height={10} />
            <Sentence metric={s.metric} />
          </div>
          <Breakdown metric={s.metric} filter={s.filter} setFilter={s.setFilter} />
        </div>
      )}
      {s.hidden && (
        <div className="flex items-center justify-end border-b border-border-subtle px-5 py-2.5">
          <DotsMenu hidden={s.hidden} setHidden={s.setHidden} />
        </div>
      )}
      <GroupedView />
    </section>
  );
}

// ── Variant B — Slim one-line toolbar ─────────────────────────────────────────
// Everything on a single compact line above the groups: count · bar · % · toggle · ⋯.
// Filter lives in the ⋯ menu. The bar stays visible even when every group is collapsed.
function VariantB(s: Shared) {
  return (
    <section className={PANEL}>
      <FauxTabs />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-subtle px-5 py-3.5">
        <CountBadge />
        {!s.hidden && (
          <div className="flex min-w-[160px] flex-1 items-center gap-3">
            <div className="max-w-[360px] flex-1">
              <SegBar metric={s.metric} height={8} />
            </div>
            <span className="shrink-0 text-body-lg tabular-nums text-text-secondary">
              <span className="font-semibold text-text-primary">{donePct(s.metric)}%</span> done
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!s.hidden && <MetricToggle metric={s.metric} setMetric={s.setMetric} />}
          <DotsMenu hidden={s.hidden} setHidden={s.setHidden} />
        </div>
      </div>
      <GroupedView />
    </section>
  );
}

// ── Variant C — Quiet strip ───────────────────────────────────────────────────
// Lightest touch: a thin toolbar (count + ⋯) and a soft inset strip where the
// legend itself explains the colours. Easiest to glance past or hide entirely.
function VariantC(s: Shared) {
  return (
    <section className={PANEL}>
      <FauxTabs />
      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-2.5">
        <CountBadge />
        <div className="ml-auto">
          <DotsMenu hidden={s.hidden} setHidden={s.setHidden} />
        </div>
      </div>
      {!s.hidden && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-xl bg-overlay-subtle px-4 py-3">
          <Breakdown metric={s.metric} filter={s.filter} setFilter={s.setFilter} size="sm" />
          <div className="flex min-w-[140px] flex-1 items-center gap-3">
            <SegBar metric={s.metric} height={8} />
            <span className="shrink-0 text-body-lg font-semibold tabular-nums text-text-primary">{donePct(s.metric)}% done</span>
          </div>
          <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-wide">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => s.setMetric(m.key)}
                className={`cursor-pointer transition-colors duration-150 ${
                  s.metric === m.key ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {total(m.key)} {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <GroupedView />
    </section>
  );
}

// ── Variant D — Re-earned header ──────────────────────────────────────────────
// Keeps a title, but makes it say something the tab does not: "Across 4 sprints".
// That justifies a header instead of repeating "Child issues", with the bar +
// pills + toggle beneath it.
function VariantD(s: Shared) {
  return (
    <section className={PANEL}>
      <FauxTabs />
      <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
              Across {SPRINT_COUNT} sprints
            </h3>
            <CountBadge />
          </div>
          <div className="flex items-center gap-2">
            <MetricToggle metric={s.metric} setMetric={s.setMetric} withTotals />
            <DotsMenu hidden={s.hidden} setHidden={s.setHidden} />
          </div>
        </div>
        {!s.hidden && (
          <>
            <div className="flex items-center gap-3">
              <SegBar metric={s.metric} height={10} />
              <Sentence metric={s.metric} />
            </div>
            <Breakdown metric={s.metric} filter={s.filter} setFilter={s.setFilter} />
          </>
        )}
      </div>
      <GroupedView />
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const VARIANTS: { id: string; title: string; why: string; chosen?: boolean; render: (s: Shared) => React.ReactNode }[] = [
  {
    id: "B",
    title: "Slim one-line toolbar",
    why: "Chosen direction. Count · bar · % · toggle · ⋯ on one line above the groups — no standing status labels. Hover any segment of the bar to reveal that status, its count and its share. Filter moves into the ⋯ menu; the bar survives collapsing every sprint.",
    chosen: true,
    render: VariantB,
  },
  {
    id: "A",
    title: "Consolidated tab header",
    why: "Drops the repeated “Child Issues” title and makes the roll-up the tab header: count + toggle + the ⋯ actions, with a sentence that spells out the % and a calm clickable breakdown beneath.",
    render: VariantA,
  },
  {
    id: "C",
    title: "Quiet strip",
    why: "Lightest: a thin actions toolbar plus a soft inset strip with a calm clickable breakdown. Easiest to ignore or hide.",
    render: VariantC,
  },
  {
    id: "D",
    title: "Re-earned header",
    why: "Keeps a header but makes the title earn its place — “Across 4 sprints” says something the tab does not — with the bar and breakdown beneath.",
    render: VariantD,
  },
];

export default function EpicProgressExplorationPage() {
  const [metric, setMetric] = useState<Metric>("items");
  const [filter, setFilter] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const shared: Shared = { metric, setMetric, filter, setFilter, hidden, setHidden };

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors duration-150"
        >
          <ArrowLeft size={14} strokeWidth={1.75} /> All explorations
        </Link>

        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            epic progress summary
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            A legible roll-up above the sprint groups
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Two things changed the brief: the most-used list is grouped by sprint (shown below each variant), and child
            issues now live on their own tab — so the separate &ldquo;Child Issues 22 of 26 ⋯&rdquo; header is a
            redundant repeat. Each variant therefore folds that header&rsquo;s count and ⋯ actions into the roll-up and
            drops the duplicated title. Each sprint group keeps its own collapse chevron; the summary is shown/hidden
            from the ⋯ menu.
          </p>
        </header>

        <div className="mb-7 flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-overlay-subtle px-3 py-2.5">
          <span className="text-caption font-medium uppercase tracking-wide text-text-muted">Shared controls</span>
          <MetricToggle metric={metric} setMetric={setMetric} withTotals />
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-[var(--color-surface-elevated)] px-2.5 py-1.5 text-body-sm text-text-secondary hover:text-text-primary cursor-pointer transition-colors duration-150"
          >
            {hidden ? <Eye size={14} strokeWidth={1.5} /> : <EyeOff size={14} strokeWidth={1.5} />}
            {hidden ? "Summary hidden" : "Summary shown"}
          </button>
        </div>

        <div className="flex flex-col gap-10">
          {VARIANTS.map((v) => (
            <div key={v.id}>
              <div className="mb-3">
                <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                  <span className="text-[var(--color-brand-400)]">{v.id}</span>
                  {v.title}
                  {v.chosen && (
                    <span className="rounded-full bg-[var(--color-status-done-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">
                      Chosen
                    </span>
                  )}
                </h2>
                <p className="mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">{v.why}</p>
              </div>
              {v.render(shared)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
