"use client";

import { useMemo } from "react";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import { selectRecentSprintIds, progressPercent } from "@/lib/epic-progress";
import { Tooltip } from "@/components/shared/Tooltip";

interface SprintMeta {
  id: number;
  name: string;
  state: string;
}

// Cross-sprint track: one cell per sprint in the recent window (chronological)
// plus backlog. Cells the epic spans are filled by done/total; others sit muted.
export function EpicTimeline({ epic, sprints }: { epic: EpicProgressItem; sprints: SprintMeta[] }) {
  const cells = useMemo(() => {
    const recentIds = selectRecentSprintIds(sprints);
    const byId = new Map(sprints.map((s) => [String(s.id), s]));
    const perSprint = new Map(epic.perSprint.map((p) => [p.sprintId, p]));

    const base = recentIds.map((id) => ({
      id,
      label: byId.get(id)?.name ?? id,
      active: byId.get(id)?.state === "active",
      data: perSprint.get(id) ?? null,
    }));

    // Append backlog only when the epic actually has backlog tickets.
    if (perSprint.has("")) {
      base.push({ id: "", label: "Backlog", active: false, data: perSprint.get("") ?? null });
    }
    return base;
  }, [epic.perSprint, sprints]);

  if (cells.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1.5">
      {cells.map((cell) => {
        const total = cell.data?.total ?? 0;
        const completed = cell.data?.completed ?? 0;
        const spans = total > 0;
        const pct = progressPercent(completed, total);

        return (
          <Tooltip
            key={cell.id || "backlog"}
            content={
              spans
                ? `${cell.label}: ${completed}/${total} done`
                : `${cell.label}: no tickets`
            }
          >
            <div
              className={`flex min-w-[64px] flex-1 flex-col gap-1 rounded-md border px-2 py-1.5 transition-colors duration-150 ${
                cell.active
                  ? "border-[var(--color-brand-500)]/40 bg-[var(--color-brand-600)]/8"
                  : spans
                    ? "border-border-default bg-surface-elevated"
                    : "border-border-subtle bg-transparent"
              }`}
            >
              <span
                className={`truncate text-[10px] font-medium uppercase tracking-wide ${
                  spans ? "text-text-secondary" : "text-text-muted"
                }`}
              >
                {cell.label}
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-overlay-default">
                {spans && (
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: "var(--color-status-done)" }}
                  />
                )}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
