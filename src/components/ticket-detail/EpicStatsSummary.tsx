"use client";

import { useMemo } from "react";
import type { EpicChild, Subtask, JiraStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS, JIRA_STATUS_ABBREVIATIONS } from "@/types/ticket";

// The four working statuses, in flow order. DEPRECATED is treated as noise and
// excluded from the roll-up (matching the child list's default).
const DISTRIBUTION: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE"];

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
}

// Read-only epic roll-up shown above the child list in the side panel (BRDG-131):
// ticket count with open/closed split, full status distribution (incl. TEST,
// which the per-status filter chips omit) and story-point progress. Everything is
// derived from the already-loaded children, so it costs no extra fetch and
// refreshes with the panel's background Jira sync.
export function EpicStatsSummary({ items }: { items: (EpicChild | Subtask)[] }) {
  const stats = useMemo(() => {
    const active = items.filter((i) => i.jiraStatus !== "DEPRECATED");
    const counts = Object.fromEntries(DISTRIBUTION.map((s) => [s, 0])) as Record<JiraStatus, number>;
    let spTotal = 0;
    let spDone = 0;
    for (const i of active) {
      if (i.jiraStatus in counts) counts[i.jiraStatus] += 1;
      if (isEpicChild(i)) {
        const sp = i.storyPoints ?? 0;
        spTotal += sp;
        if (i.jiraStatus === "DONE") spDone += sp;
      }
    }
    const total = active.length;
    const done = counts.DONE;
    return { total, done, open: total - done, counts, spTotal, spDone };
  }, [items]);

  if (stats.total === 0) return null;

  // Prefer story-point completion; fall back to ticket completion when the epic
  // carries no estimates so the bar is never stuck at 0 on an active epic.
  const pct = stats.spTotal > 0
    ? Math.round((stats.spDone / stats.spTotal) * 100)
    : Math.round((stats.done / stats.total) * 100);

  return (
    <div className="mb-4 rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5 text-text-secondary">
          <span className="text-heading-sm font-semibold tabular-nums text-text-primary">{stats.total}</span>
          <span className="text-body-sm">{stats.total === 1 ? "story" : "stories"}</span>
          <span className="text-text-muted">&middot;</span>
          <span className="text-body-sm tabular-nums">{stats.open} open</span>
          <span className="text-text-muted">&middot;</span>
          <span className="text-body-sm tabular-nums">{stats.done} done</span>
        </div>
        {stats.spTotal > 0 && (
          <span className="shrink-0 text-body-sm tabular-nums text-text-muted">
            <span className="font-medium text-text-secondary">{stats.spDone}</span>/{stats.spTotal} pts
          </span>
        )}
      </div>

      {/* Progress bar (SP completion, or ticket completion when unestimated). */}
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-overlay-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: "var(--color-status-done)", transition: "width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </div>

      {/* Status distribution: all four working statuses, dimmed when empty. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DISTRIBUTION.map((status) => {
          const count = stats.counts[status];
          const c = JIRA_STATUS_COLORS[status];
          return (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums"
              style={{ backgroundColor: c.bg, color: c.text, opacity: count === 0 ? 0.4 : 1 }}
              title={`${count} ${status}`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.text }} />
              {JIRA_STATUS_ABBREVIATIONS[status]}
              <span>{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
