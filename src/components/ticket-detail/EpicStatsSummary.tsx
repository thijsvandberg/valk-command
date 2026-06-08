"use client";

import { useMemo } from "react";
import type { EpicChild, Subtask, JiraStatus } from "@/types/ticket";
import { StatusPill, STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import type { StatusFilter } from "./FieldFilterPopover";

// The four working statuses. DEPRECATED is treated as noise and excluded from the
// roll-up (matching the child list's default).
const DISTRIBUTION: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE"];
// Progress-bar segment order, most-complete first so DONE fills from the left.
const SEGMENTS: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
}

// Read-only epic roll-up shown above the child list (BRDG-131): ticket count, the
// status distribution as the same clickable status pills as the sprint backlog
// (which also drive the child-list status filter), and a segmented progress bar
// showing every working status (not just DONE). Everything is derived from the
// already-loaded children, so it costs no extra fetch and refreshes with the
// background Jira sync.
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
    return { total: active.length, done: counts.DONE, counts, spTotal, spDone };
  }, [items]);

  if (stats.total === 0) return null;

  // Bar + percentage are by ticket count so every present status shows a slice
  // (a single unestimated in-progress story would vanish on a points-weighted bar).
  // Story points stay a separate "x/y pts" readout.
  const pct = Math.round((stats.done / stats.total) * 100);

  return (
    <div className="mb-4 rounded-2xl border border-border-subtle bg-[var(--color-surface-elevated)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.10)]">
      {/* Count + status pills + story-point total. The pills replace the old
          open/done text and double as the child-list status filter. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
          <span className="font-[var(--font-display)] text-[1.6rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text-primary">
            {stats.total}
          </span>
          <span className="mr-0.5 text-body-sm text-text-muted">{stats.total === 1 ? "story" : "stories"}</span>
          {DISTRIBUTION.map((status) => {
            const count = stats.counts[status];
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
        {stats.spTotal > 0 && (
          <span className="shrink-0 text-body-sm tabular-nums text-text-muted">
            <span className="font-semibold text-text-secondary">{stats.spDone}</span>/{stats.spTotal} pts
          </span>
        )}
      </div>

      {/* Segmented progress: one slice per present status (DONE first), sized by
          story points (or ticket count when unestimated). */}
      <div className="mt-3 flex items-center gap-2.5">
        <div
          className="flex h-2 flex-1 overflow-hidden rounded-full bg-overlay-subtle"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {SEGMENTS.map((status) => {
            const count = stats.counts[status];
            if (count <= 0) return null;
            return (
              <div
                key={status}
                className="h-full"
                title={`${status}: ${count}`}
                style={{
                  width: `${(count / stats.total) * 100}%`,
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
