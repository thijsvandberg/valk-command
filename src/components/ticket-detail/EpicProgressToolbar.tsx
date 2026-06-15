"use client";

import { useMemo } from "react";
import type { EpicChild, Subtask, JiraStatus } from "@/types/ticket";
import { STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import { Tooltip } from "@/components/shared/Tooltip";
import { useMigratedAccountSetting } from "@/hooks/useMigratedAccountSetting";
import { Filter, EyeOff, X } from "lucide-react";

// The four working statuses. DEPRECATED is treated as noise and excluded from the
// roll-up (matching the child list's default).
const DISTRIBUTION: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE"];
// Progress-bar segment order, most-complete first so DONE fills from the left.
const SEGMENTS: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];
const LOWER: Record<string, string> = {
  "TO DO": "to do",
  "IN PROGRESS": "in progress",
  TEST: "test",
  DONE: "done",
};

type Metric = "items" | "sp" | "bv";
const METRICS: { key: Metric; label: string }[] = [
  { key: "items", label: "items" },
  { key: "sp", label: "SP" },
  { key: "bv", label: "BV" },
];

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
}

const zeroByStatus = () => Object.fromEntries(DISTRIBUTION.map((s) => [s, 0])) as Record<JiraStatus, number>;
const segColor = (s: JiraStatus) => STATUS_PILL_COLORS[s].dot ?? STATUS_PILL_COLORS[s].text;
const metricLabel = (m: Metric) => METRICS.find((x) => x.key === m)!.label;

// Compact items / SP / BV switch. Labels only (no totals): the bar already shows the
// distribution, so the toggle just picks what it measures.
function MetricToggle({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
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
            className={`rounded-lg px-2.5 py-1 text-caption font-medium uppercase tracking-wide cursor-pointer transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
              active
                ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)] text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// Segmented bar where each colour is its own hover target. Hovering a segment reveals
// a styled tooltip with that status, its count for the active metric and its share.
// The colored span carries an EXPLICIT height: a percentage/`h-full` height collapses
// to 0 inside the Tooltip's inline-flex trigger wrapper.
function SegBar({
  metric,
  byStatus,
  total,
}: {
  metric: Metric;
  byStatus: Record<JiraStatus, number>;
  total: number;
}) {
  const label = metricLabel(metric);
  const pct = total > 0 ? Math.round((byStatus.DONE / total) * 100) : 0;
  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-overlay-subtle"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label} completion`}
    >
      {SEGMENTS.map((s) => {
        const v = byStatus[s];
        if (v <= 0) return null;
        const segPct = Math.round((v / total) * 100);
        return (
          <div
            key={s}
            className="flex min-w-0"
            style={{ width: `${(v / total) * 100}%`, transition: "width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            <Tooltip
              delay={120}
              className="w-full"
              content={
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segColor(s) }} />
                  <span className="font-semibold">
                    {v} {label}
                  </span>
                  <span className="text-text-muted">
                    {LOWER[s]} · {segPct}%
                  </span>
                </span>
              }
            >
              <span className="block w-full cursor-default" style={{ height: 8, backgroundColor: segColor(s) }} />
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

// Slim roll-up shown above the child list (BRDG-331, replacing the floating
// EpicStatsSummary card). One row: child count + segmented progress bar (status
// breakdown on hover) + completion percentage + a metric toggle (items / SP / BV) +
// the child-list options menu, passed in via `actions`. Everything is derived from
// the already-loaded children, so it costs no extra fetch.
export function EpicProgressToolbar({
  items,
  filteredCount,
  totalCount,
  isFiltered,
  statusHiddenCount = 0,
  deprecatedHiddenCount = 0,
  deprecatedCount = 0,
  onToggleFilter,
  showStats = true,
  hidden = false,
  actions,
}: {
  items: (EpicChild | Subtask)[];
  filteredCount: number;
  totalCount: number;
  isFiltered: boolean;
  /** Of the hidden children, how many the status filter excludes. */
  statusHiddenCount?: number;
  /** Of the hidden children, how many are hidden because they are deprecated. */
  deprecatedHiddenCount?: number;
  /** Total deprecated children — what the default view would hide from the show-all state. */
  deprecatedCount?: number;
  /** Toggles the count badge: filtered view → show all → back to default. */
  onToggleFilter?: () => void;
  /** When false, only the count + actions render (no progress bar) — e.g. non-epic contexts. */
  showStats?: boolean;
  /** Hide the progress bar / percentage / metric toggle. Preference owned by the parent. */
  hidden?: boolean;
  /** Right-aligned controls — the child-list options ⋯ menu. */
  actions?: React.ReactNode;
}) {
  const { value: metric, setValue: setMetric } = useMigratedAccountSetting<Metric>(
    "/api/settings/epic-stats-metric",
    "epic-stats-metric",
    "items",
  );

  const stats = useMemo(() => {
    const active = items.filter((i) => i.jiraStatus !== "DEPRECATED");
    const byStatus: Record<Metric, Record<JiraStatus, number>> = {
      items: zeroByStatus(),
      sp: zeroByStatus(),
      bv: zeroByStatus(),
    };
    const totals: Record<Metric, number> = { items: 0, sp: 0, bv: 0 };
    for (const i of active) {
      const s = i.jiraStatus;
      if (!(s in byStatus.items)) continue;
      byStatus.items[s] += 1;
      totals.items += 1;
      if (isEpicChild(i)) {
        const sp = i.storyPoints ?? 0;
        byStatus.sp[s] += sp;
        totals.sp += sp;
        const bv = i.businessValue ?? 0;
        byStatus.bv[s] += bv;
        totals.bv += bv;
      }
    }
    return { byStatus, totals };
  }, [items]);

  const seg = stats.byStatus[metric];
  const total = stats.totals[metric];
  const pct = total > 0 ? Math.round((seg.DONE / total) * 100) : 0;
  // The roll-up itself hides when there are no non-deprecated children (matching the
  // old card's null return), but the count + actions always stay so you can still act
  // on an empty epic.
  const showBar = showStats && !hidden && stats.totals.items > 0;

  const countLabel =
    isFiltered && totalCount > 0
      ? `${filteredCount} of ${totalCount} items`
      : totalCount > 0
        ? `${totalCount} items`
        : null;

  // Badge interaction modes:
  //  - "filtered":  something is hidden -> click shows all (X icon).
  //  - "show-all":  everything is shown but the default would hide deprecated ->
  //                 click restores the default (filter icon).
  //  - "static":    nothing to toggle -> plain label.
  const countMode = !onToggleFilter || countLabel === null
    ? "static"
    : isFiltered
      ? "filtered"
      : deprecatedCount > 0
        ? "show-all"
        : "static";
  const hiddenTotal = statusHiddenCount + deprecatedHiddenCount;

  const countTooltip = countMode === "filtered" ? (
    <div className="flex w-max flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-text-primary tabular-nums">{filteredCount} shown</span>
        <span className="text-text-muted tabular-nums">of {totalCount} total</span>
      </div>
      {hiddenTotal > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-1.5">
          {statusHiddenCount > 0 && (
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
              <Filter size={11} className="shrink-0 text-text-muted" />
              <span className="tabular-nums font-medium">{statusHiddenCount}</span>
              <span className="text-text-muted">hidden by status filter</span>
            </span>
          )}
          {deprecatedHiddenCount > 0 && (
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
              <EyeOff size={11} className="shrink-0 text-text-muted" />
              <span className="tabular-nums font-medium">{deprecatedHiddenCount}</span>
              <span className="text-text-muted">deprecated, hidden</span>
            </span>
          )}
        </div>
      )}
      <span className="border-t border-border-subtle pt-1.5 text-caption text-text-muted">
        Click to show all
      </span>
    </div>
  ) : (
    <div className="flex w-max flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-text-primary tabular-nums">All {totalCount} shown</span>
      </div>
      <div className="border-t border-border-subtle pt-1.5">
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
          <EyeOff size={11} className="shrink-0 text-text-muted" />
          <span className="tabular-nums font-medium">{deprecatedCount}</span>
          <span className="text-text-muted">deprecated, included</span>
        </span>
      </div>
      <span className="border-t border-border-subtle pt-1.5 text-caption text-text-muted">
        Click to hide deprecated
      </span>
    </div>
  );

  const countAria =
    countMode === "filtered"
      ? `${filteredCount} of ${totalCount} items shown — click to show all`
      : `All ${totalCount} items shown — click to hide deprecated`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-default pb-2">
      {countLabel && (
        countMode !== "static" ? (
          <Tooltip content={countTooltip} delay={200}>
            <button
              type="button"
              onClick={onToggleFilter}
              aria-label={countAria}
              className="group flex h-5 items-center gap-1 rounded-full bg-overlay-default pl-1.5 pr-1 text-caption font-medium tabular-nums text-text-tertiary cursor-pointer transition-[background-color,color] duration-150 hover:bg-overlay-strong hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            >
              {countLabel}
              {countMode === "filtered" ? (
                <X size={11} strokeWidth={2} className="shrink-0 text-text-muted transition-colors duration-150 group-hover:text-text-secondary" />
              ) : (
                <EyeOff size={11} strokeWidth={2} className="shrink-0 text-text-muted transition-colors duration-150 group-hover:text-text-secondary" />
              )}
            </button>
          </Tooltip>
        ) : (
          <span className="flex h-5 items-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
            {countLabel}
          </span>
        )
      )}

      {showBar && (
        <div className="flex min-w-[160px] flex-1 items-center gap-3">
          <div className="max-w-[360px] flex-1">
            <SegBar metric={metric} byStatus={seg} total={total} />
          </div>
          <span className="shrink-0 text-body-sm tabular-nums text-text-secondary">
            <span className="font-semibold text-text-primary">{pct}%</span> done
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showBar && <MetricToggle metric={metric} setMetric={setMetric} />}
        {actions}
      </div>
    </div>
  );
}
