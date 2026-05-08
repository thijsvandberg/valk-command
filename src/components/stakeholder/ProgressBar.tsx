"use client";

interface ProgressBarProps {
  completed: number;
  inReview: number;
  inProgress: number;
  total: number;
}

export function ProgressBar({ completed, inReview, inProgress, total }: ProgressBarProps) {
  const donePct = total > 0 ? (completed / total) * 100 : 0;
  const reviewPct = total > 0 ? (inReview / total) * 100 : 0;
  const progressPct = total > 0 ? (inProgress / total) * 100 : 0;
  const overallPct = Math.round(donePct);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-text-secondary">Story points</span>
        <span className="text-sm font-medium tabular-nums text-text-secondary">
          {completed} <span className="text-text-tertiary">/ {total}</span>
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-overlay-default">
        {/* Done: secondary (teal) */}
        <div
          className="absolute inset-y-0 left-0 bg-[var(--color-secondary-400)]/70 transition-[width] duration-700 ease-out"
          style={{ width: `${donePct}%` }}
        />
        {/* In Review / Testing: testing (violet) */}
        <div
          className="absolute inset-y-0 bg-[var(--color-testing-400)]/60 transition-[width,left] duration-700 ease-out"
          style={{ left: `${donePct}%`, width: `${reviewPct}%` }}
        />
        {/* In Progress: brand (blue) */}
        <div
          className="absolute inset-y-0 bg-[var(--color-brand-400)]/50 transition-[width,left] duration-700 ease-out"
          style={{ left: `${donePct + reviewPct}%`, width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-caption text-text-muted">
          {completed > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-secondary-400)]/60" />
              {completed} SP done
            </span>
          )}
          {inReview > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-testing-400)]/50" />
              {inReview} SP testing
            </span>
          )}
          {inProgress > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]/50" />
              {inProgress} SP in progress
            </span>
          )}
        </div>
        <div className="text-xs text-text-tertiary tabular-nums">{overallPct}% complete</div>
      </div>
    </div>
  );
}
