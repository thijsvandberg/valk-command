"use client";

interface ProgressBarProps {
  completed: number;
  total: number;
}

export function ProgressBar({ completed, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-white/50">Story points</span>
        <span className="text-sm font-medium tabular-nums text-white/70">
          {completed} <span className="text-white/30">/ {total}</span>
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-brand-400)] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-xs text-white/30 tabular-nums">{pct}% complete</div>
    </div>
  );
}
