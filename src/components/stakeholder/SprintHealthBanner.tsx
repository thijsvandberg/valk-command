"use client";

import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";

interface SprintHealthBannerProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  /** Render as an inline pill instead of a full-width banner */
  compact?: boolean;
}

type HealthLevel = "at-risk" | "on-track" | "behind" | "in-progress";

interface HealthResult {
  level: HealthLevel;
  message: string;
}

export function computeSprintHealth(
  donePoints: number,
  totalPoints: number,
  workingDaysRemaining: number | null,
  totalWorkingDays: number | null,
): HealthResult {
  const donePercent = totalPoints > 0 ? donePoints / totalPoints : 0;
  const days = workingDaysRemaining ?? Infinity;

  // Rule 1: no points done and 2 or fewer working days remain
  if (donePoints === 0 && days <= 2) {
    return {
      level: "at-risk",
      message: `At risk: no points completed with ${days === 1 ? "1 day" : `${days} days`} remaining`,
    };
  }

  // Rule 2: 80%+ done
  if (donePercent >= 0.8) {
    return { level: "on-track", message: "On track: sprint nearly complete" };
  }

  // Rule 3: below 25% done and at or past the halfway point
  const halfwayThreshold = totalWorkingDays !== null ? totalWorkingDays / 2 : 5;
  if (totalPoints > 0 && donePercent < 0.25 && days <= halfwayThreshold) {
    const pct = Math.round(donePercent * 100);
    return {
      level: "behind",
      message: `Behind: only ${pct}% complete at the halfway mark`,
    };
  }

  return { level: "in-progress", message: "In progress" };
}

function countWorkingDays(start: Date, end: Date): number {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Exported for testing
export function computeSprintHealthFromData(
  doneTickets: StakeholderTicket[],
  allTickets: StakeholderTicket[],
  sprint: Pick<StakeholderSprint, "workingDaysRemaining" | "startDate" | "endDate">,
): HealthResult {
  const donePoints = doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const totalWorkingDays =
    sprint.startDate && sprint.endDate
      ? countWorkingDays(new Date(sprint.startDate), new Date(sprint.endDate))
      : null;
  return computeSprintHealth(donePoints, totalPoints, sprint.workingDaysRemaining, totalWorkingDays);
}

const levelStyles: Record<HealthLevel, { dot: string; text: string; border: string; bg: string }> = {
  "at-risk": {
    dot: "bg-[var(--color-warning-400)]/70",
    text: "text-[var(--color-warning-400)]/70",
    border: "border-[var(--color-warning-400)]/20",
    bg: "bg-[var(--color-warning-400)]/[0.04]",
  },
  "behind": {
    dot: "bg-[var(--color-warning-400)]/50",
    text: "text-[var(--color-warning-400)]/50",
    border: "border-[var(--color-warning-400)]/15",
    bg: "bg-[var(--color-warning-400)]/[0.03]",
  },
  "on-track": {
    dot: "bg-[var(--color-secondary-400)]/60",
    text: "text-[var(--color-secondary-400)]/60",
    border: "border-[var(--color-secondary-400)]/20",
    bg: "bg-[var(--color-secondary-400)]/[0.03]",
  },
  "in-progress": {
    dot: "bg-overlay-strong",
    text: "text-text-tertiary",
    border: "border-border-default",
    bg: "bg-overlay-subtle",
  },
};

export function SprintHealthBanner({
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
  compact = false,
}: SprintHealthBannerProps) {
  if (sprint.state !== "active") return null;

  const allTickets = [...doneTickets, ...inProgressTickets, ...todoTickets];
  const { level, message } = computeSprintHealthFromData(doneTickets, allTickets, sprint);
  const s = levelStyles[level];

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border ${s.border} ${s.bg} px-2.5 py-1`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
        <span className={`text-body-sm ${s.text}`}>{message}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 rounded-lg border ${s.border} ${s.bg} px-3.5 py-2.5`}>
      <span className={`mt-px h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      <p className={`text-body-sm ${s.text}`}>{message}</p>
    </div>
  );
}
