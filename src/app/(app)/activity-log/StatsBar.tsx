"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";
import type {
  ActivityLogDayStats,
  HealthScore,
} from "@/types/ticket";
import { formatDuration } from "./activity-helpers";

export function HealthScoreBadge({ healthScore }: { healthScore: HealthScore }) {
  const { score, band, trend, components } = healthScore;

  const bandColor =
    band === "green"
      ? { ring: "rgba(74,222,128,0.25)", text: "text-green-400", bg: "rgba(74,222,128,0.08)" }
      : band === "amber"
      ? { ring: "rgba(251,191,36,0.25)", text: "text-amber-400", bg: "rgba(251,191,36,0.08)" }
      : { ring: "rgba(248,113,113,0.25)", text: "text-red-400", bg: "rgba(248,113,113,0.08)" };

  const tooltipContent = `Health score ${score}/100 — Success rate: ${components.successRate} · Duration consistency: ${components.durationConsistency} · Error-free streak: ${components.errorFreeStreak}`;

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-400/70" : trend === "down" ? "text-red-400/70" : "text-text-muted";

  return (
    <Tooltip content={tooltipContent}>
      <div
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-default select-none"
        style={{ background: bandColor.bg, boxShadow: `0 0 0 1px ${bandColor.ring}` }}
      >
        <span className={`text-body-lg font-bold tabular-nums font-[var(--font-display)] tracking-tight ${bandColor.text}`}>
          {score}
        </span>
        <span className="text-caption text-text-muted font-[var(--font-body)]">/100</span>
        <TrendIcon className={`h-3 w-3 ${trendColor}`} strokeWidth={2} />
      </div>
    </Tooltip>
  );
}

function DeltaChip({
  current,
  previous,
  higherIsBetter,
  format,
}: {
  current: number;
  previous: number;
  higherIsBetter: boolean;
  format: (v: number) => string;
}) {
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span className="flex items-center gap-0.5 text-caption text-text-muted font-[var(--font-body)]">
        <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
        <span>same</span>
      </span>
    );
  }
  const isGood = higherIsBetter ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const color = isGood ? "text-green-400/70" : "text-red-400/70";
  const sign = diff > 0 ? "+" : "";
  return (
    <span className={`flex items-center gap-0.5 text-caption font-[var(--font-body)] ${color}`}>
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      <span>{sign}{format(diff)}</span>
    </span>
  );
}

export function StatsBar({ today, yesterday }: { today: ActivityLogDayStats; yesterday: ActivityLogDayStats }) {
  const metrics = [
    {
      label: "Events today",
      value: today.totalEvents.toString(),
      delta: (
        <DeltaChip
          current={today.totalEvents}
          previous={yesterday.totalEvents}
          higherIsBetter={true}
          format={(v) => Math.abs(v).toString()}
        />
      ),
    },
    {
      label: "Success rate",
      value: `${today.successRate}%`,
      delta: (
        <DeltaChip
          current={today.successRate}
          previous={yesterday.successRate}
          higherIsBetter={true}
          format={(v) => `${Math.abs(v)}%`}
        />
      ),
    },
    {
      label: "Avg duration",
      value: formatDuration(today.avgDurationMs),
      delta: (
        <DeltaChip
          current={today.avgDurationMs}
          previous={yesterday.avgDurationMs}
          higherIsBetter={false}
          format={(v) => formatDuration(Math.abs(v))}
        />
      ),
    },
    {
      label: "Active errors",
      value: today.activeErrorCount.toString(),
      delta: (
        <DeltaChip
          current={today.activeErrorCount}
          previous={yesterday.activeErrorCount}
          higherIsBetter={false}
          format={(v) => Math.abs(v).toString()}
        />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex flex-col gap-1 rounded-xl border border-border-default bg-[var(--color-surface-elevated)] px-4 py-3 shadow-[var(--shadow-sm)]"
        >
          <span className="text-caption uppercase tracking-widest text-text-muted font-semibold font-[var(--font-body)]">
            {m.label}
          </span>
          <span className="text-heading font-bold tabular-nums font-[var(--font-display)] tracking-tight text-text-primary">
            {m.value}
          </span>
          {m.delta}
        </div>
      ))}
    </div>
  );
}
