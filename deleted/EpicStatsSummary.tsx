"use client";

import { useMemo } from "react";
import type { EpicChild, Subtask, JiraStatus } from "@/types/ticket";
import { StatusPill, STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import type { StatusFilter } from "./FieldFilterPopover";
import { useLocalStorage } from "@/hooks/useLocalStorage";

// The four working statuses. DEPRECATED is treated as noise and excluded from the
// roll-up (matching the child list's default).
const DISTRIBUTION: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE"];
// Progress-bar segment order, most-complete first so DONE fills from the left.
const SEGMENTS: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];

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

// Read-only epic roll-up shown above the child list (BRDG-131). The status pills
// (same as the sprint backlog) double as the child-list status filter; a metric
// toggle (items / SP / BV) shows each total and drives the segmented progress bar.
// The pills and toggle share a row when wide and stack when narrow. Everything is
// derived from the already-loaded children, so it costs no extra fetch and
// refreshes with the background Jira sync.
export function EpicStatsSummary({
  items,
  activeStatus = "all",
  onSelectStatus,
}: {
  items: (EpicChild | Subtask)[];
  /** Currently applied status filter on the child list, for the active pill state. */
  activeStatus?: StatusFilter;
  /** Toggle the child-list filter for a status. Omit to render the pills read-only. */
  onSelectStatus?: (status: JiraStatus) => void;
}) {
  const [metric, setMetric] = useLocalStorage<Metric>("epic-stats-metric", "items");

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

  if (stats.totals.items === 0) return null;

  const seg = stats.byStatus[metric];
  const total = stats.totals[metric];
  const pct = total > 0 ? Math.round((seg.DONE / total) * 100) : 0;

  return (
    <div className="mb-4 rounded-2xl border border-border-subtle bg-[var(--color-surface-elevated)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.10)]">
      {/* Status pills (left) + metric toggle (right): one row when wide, stacked
          when narrow. The pills are the child-list status filter; the toggle picks
          what the progress bar measures and shows each metric's total. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {DISTRIBUTION.map((status) => {
            const count = stats.byStatus.items[status];
            if (count === 0) return null;
            return (
              <StatusPill
                key={status}
                size="badge"
                colorKey={status}
                label={status}
                count={count}
                active={activeStatus === status}
                onClick={onSelectStatus ? () => onSelectStatus(status) : undefined}
              />
            );
          })}
        </div>

        <div className="inline-flex items-stretch rounded-xl border border-border-subtle bg-overlay-subtle p-0.5">
          {METRICS.map((m) => {
            const isActive = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setMetric(m.key)}
                className={`inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 transition-[background-color,box-shadow,color] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                  isActive
                    ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <span
                  className={`font-[var(--font-display)] text-body-lg font-semibold leading-none tracking-[-0.02em] tabular-nums ${
                    isActive ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {stats.totals[m.key]}
                </span>
                <span className="text-caption font-medium uppercase tracking-wide">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Segmented progress for the selected metric: one slice per present status
          (DONE first), with a completion percentage. */}
      <div className="mt-3 flex items-center gap-2.5">
        <div
          className="flex h-2 flex-1 overflow-hidden rounded-full bg-overlay-subtle"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${metric} completion`}
        >
          {SEGMENTS.map((status) => {
            const v = seg[status];
            if (v <= 0) return null;
            return (
              <div
                key={status}
                className="h-full"
                title={`${status}: ${v} ${metric}`}
                style={{
                  width: `${(v / total) * 100}%`,
                  backgroundColor: STATUS_PILL_COLORS[status].text,
                  transition: "width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            );
          })}
        </div>
        <span className="w-9 shrink-0 text-right text-caption font-medium tabular-nums text-text-muted">{pct}%</span>
      </div>
    </div>
  );
}
