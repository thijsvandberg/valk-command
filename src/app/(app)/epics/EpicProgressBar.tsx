"use client";

import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import { epicProgress } from "@/lib/epic-progress";
import { Tooltip } from "@/components/shared/Tooltip";

interface Segment {
  label: string;
  value: number;
  color: string;
}

// Horizontal stacked completion bar. Points-based when the epic has estimates,
// otherwise a two-tone done/remaining bar driven by ticket counts (clearly tagged).
export function EpicProgressBar({ epic }: { epic: EpicProgressItem }) {
  const { percent, pointsBased } = epicProgress(epic);

  const segments: Segment[] = pointsBased
    ? [
        { label: "Done", value: epic.completedPoints, color: "var(--color-status-done)" },
        { label: "In progress", value: epic.inProgressPoints, color: "var(--color-status-progress)" },
        { label: "To do", value: epic.todoPoints, color: "var(--color-status-neutral)" },
      ]
    : [
        { label: "Done", value: epic.completedTickets, color: "var(--color-status-done)" },
        { label: "Remaining", value: epic.totalTickets - epic.completedTickets, color: "var(--color-status-neutral)" },
      ];

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex w-full items-center gap-3">
      <div
        className="relative flex h-2 flex-1 overflow-hidden rounded-full bg-overlay-default"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% complete`}
      >
        {total > 0 &&
          segments.map((s) =>
            s.value > 0 ? (
              <Tooltip key={s.label} content={`${s.label}: ${s.value}${pointsBased ? " pts" : ""}`}>
                <div
                  className="h-full transition-[width] duration-300 ease-out first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                />
              </Tooltip>
            ) : null,
          )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="w-9 text-right font-mono text-body-sm font-semibold tabular-nums text-text-primary">
          {percent}%
        </span>
        {!pointsBased && (
          <Tooltip content="No story-point estimates on this epic — progress is based on ticket count">
            <span className="rounded bg-overlay-default px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              by count
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
