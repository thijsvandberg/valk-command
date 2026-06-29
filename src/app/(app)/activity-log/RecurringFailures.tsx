"use client";

import { CheckCircle2, RepeatIcon } from "lucide-react";
import type { RecurringFailure } from "@/types/ticket";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { entryTypeLabel, formatRelativeTime } from "./activity-helpers";

export function RecurringFailures({
  failures,
  sprintMap,
  onJumpToEntry,
}: {
  failures: RecurringFailure[];
  sprintMap: Map<string, string>;
  onJumpToEntry: (id: string) => void;
}) {
  if (failures.length === 0) {
    return (
      <Card variant="subtle" className="mb-5 px-4 py-4">
        <PanelHeader
          icon={<RepeatIcon className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Recurring Failures"
          className="mb-3"
        />
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand-400)]/50" strokeWidth={1.5} />
          <span className="text-body-sm text-text-muted font-[var(--font-body)]">
            No recurring failures in the last 7 days
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-5 overflow-hidden border-amber-400/[0.12] shadow-sm">
      <div className="border-b border-border-subtle bg-amber-400/[0.03] px-4 py-3">
        <PanelHeader
          icon={<RepeatIcon className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Recurring Failures"
          tone="warning"
          meta={<Badge variant="warning" size="sm">{failures.length}</Badge>}
        />
      </div>
      <div className="divide-y divide-border-subtle">
        {failures.map((f) => (
          <button
            key={`${f.type}::${f.pattern}`}
            type="button"
            onClick={() => onJumpToEntry(f.mostRecentEntryId)}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-overlay-subtle transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] text-left"
          >
            <div className="flex flex-col items-start gap-0.5 min-w-[110px] shrink-0">
              <span className="text-label text-text-secondary font-[var(--font-body)]">
                {entryTypeLabel(f.type)}
              </span>
              <span className="text-caption text-text-muted font-[var(--font-body)]">
                {formatRelativeTime(f.lastOccurrence)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm text-amber-400/70 font-[var(--font-body)] truncate leading-relaxed">
                {f.pattern}
              </p>
              {f.affectedScopes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {f.affectedScopes.slice(0, 5).map((scope) => {
                    const sprintName = sprintMap.get(scope);
                    return (
                      <span
                        key={scope}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-caption bg-overlay-subtle text-text-tertiary font-[var(--font-body)]"
                      >
                        {sprintName ?? scope}
                      </span>
                    );
                  })}
                  {f.affectedScopes.length > 5 && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-caption text-text-muted font-[var(--font-body)]">
                      +{f.affectedScopes.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <span className="text-body-lg font-bold tabular-nums font-[var(--font-display)] text-amber-400/80">
                {f.count}
              </span>
              <span className="text-caption text-text-muted font-[var(--font-body)]">occurrences</span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
