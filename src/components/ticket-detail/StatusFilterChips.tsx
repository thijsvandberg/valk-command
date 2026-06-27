"use client";

import { memo } from "react";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import type { JiraStatus } from "@/types/ticket";

interface StatusFilterChipsProps {
  statuses: Array<{ status: string; count: number }>;
  activeStatuses: Set<string>;
  onToggle: (status: string) => void;
  onClear: () => void;
}

export const StatusFilterChips = memo(function StatusFilterChips({
  statuses,
  activeStatuses,
  onToggle,
  onClear,
}: StatusFilterChipsProps) {
  if (statuses.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border-default px-3 py-1.5">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClear(); }}
        className={`cursor-pointer rounded px-1.5 py-0.5 text-caption font-medium tracking-wide transition-colors duration-100 ${
          activeStatuses.size === 0
            ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
      >
        All
      </button>
      {statuses.map(({ status, count }) => {
        const isActive = activeStatuses.has(status);
        const color = JIRA_STATUS_COLORS[status as JiraStatus] ?? {
          bg: "var(--color-status-neutral-subtle)",
          text: "var(--color-status-neutral)",
        };
        return (
          <button
            key={status}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onToggle(status); }}
            className="cursor-pointer rounded px-1.5 py-0.5 text-caption font-medium tracking-wide transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{
              backgroundColor: isActive ? color.bg : undefined,
              color: isActive ? color.text : "var(--color-text-muted)",
            }}
          >
            {status}
            <span className="ml-0.5 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
});
