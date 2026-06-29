"use client";

import { STATUS_FILTER_OPTIONS, type StatusFilter } from "./FieldFilterPopover";

interface ChildIssueStatusFilterProps {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
}

export function ChildIssueStatusFilter({
  filter,
  setFilter,
  statusCounts,
}: ChildIssueStatusFilterProps) {
  return (
    <div className="mt-3 flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const isActive = filter === opt.value;
        const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
        if (opt.value !== "all" && count === 0) return null;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1 text-label font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "bg-surface-elevated text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {opt.label}
            <span className={`tabular-nums text-caption ${isActive ? "text-text-secondary" : "text-text-muted"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
