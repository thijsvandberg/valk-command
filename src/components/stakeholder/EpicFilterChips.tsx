"use client";

import type { StakeholderTicket } from "@/lib/stakeholder-data";
import { useEpicColorResolver } from "@/hooks/useEpicColor";

interface EpicFilterChipsProps {
  tickets: StakeholderTicket[];
  selectedEpics: Set<string>;
  onToggle: (epic: string) => void;
  onClearAll: () => void;
}

function buildEpicCounts(tickets: StakeholderTicket[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const key = t.epic ?? "Other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries());
}

export function EpicFilterChips({
  tickets,
  selectedEpics,
  onToggle,
  onClearAll,
}: EpicFilterChipsProps) {
  const epicCounts = buildEpicCounts(tickets);
  const epicColor = useEpicColorResolver();

  // Only render when sprint has tickets from 2+ distinct epics
  if (epicCounts.length < 2) return null;

  const isAllActive = selectedEpics.size === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* "All" chip */}
      <button
        type="button"
        onClick={onClearAll}
        className={[
          "rounded-full px-2.5 py-1 text-body-sm transition-colors duration-100 cursor-pointer",
          isAllActive
            ? "bg-[var(--color-brand-400)]/15 text-[var(--color-brand-400)]/80"
            : "bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary",
        ].join(" ")}
      >
        All
      </button>

      {epicCounts.map(([epic, count]) => {
        const isActive = selectedEpics.has(epic);
        const color = epicColor(epic);
        return (
          <button
            key={epic}
            type="button"
            onClick={() => onToggle(epic)}
            style={
              isActive
                ? { backgroundColor: color.bg, color: color.text, boxShadow: `inset 0 0 0 1px ${color.border}` }
                : undefined
            }
            className={[
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body-sm transition-colors duration-100 cursor-pointer",
              isActive
                ? ""
                : "bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary",
            ].join(" ")}
          >
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.text }} />
              {epic}
            </span>
            <span
              className={[
                "rounded-full px-1 py-px text-caption tabular-nums",
                isActive ? "" : "bg-overlay-default",
              ].join(" ")}
              style={isActive ? { backgroundColor: color.border } : undefined}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
