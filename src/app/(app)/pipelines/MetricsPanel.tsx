"use client";

import { useMemo } from "react";
import { Activity, TrendingUp, Timer, Rocket, Filter } from "lucide-react";
import { Card } from "@/components/shared/Card";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";
import { formatDuration } from "./pipeline-helpers";

export function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "emerald" | "amber" | "red";
}) {
  const accentColor =
    accent === "emerald" ? "rgba(52,211,153,0.08)" :
    accent === "red" ? "rgba(248,113,113,0.08)" :
    accent === "amber" ? "rgba(251,191,36,0.08)" :
    "rgba(26,111,194,0.06)";

  return (
    <Card className="relative overflow-hidden px-4 py-3">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at bottom right, ${accentColor}, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-label font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
      </div>
      <span className="relative font-[var(--font-display)] text-heading-lg font-bold tracking-tight text-text-primary">
        {value}
      </span>
    </Card>
  );
}

export function PipelineMetrics({ runs }: { runs: PipelineRunPayload[] }) {
  const stats = useMemo(() => {
    const todayCutoff = new Date();
    todayCutoff.setHours(0, 0, 0, 0);
    const todayRuns = runs.filter((r) => new Date(r.createdAt) >= todayCutoff);
    const completed = todayRuns.filter((r) => r.state !== "IN_PROGRESS");
    const passed = completed.filter((r) => r.state === "SUCCESSFUL");
    const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
    const durations = completed.filter((r) => r.durationSeconds).map((r) => r.durationSeconds!);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const running = runs.filter((r) => r.state === "IN_PROGRESS");
    const deployments = runs.filter((r) => r.isDeployment);

    return { todayCount: todayRuns.length, passRate, avgDuration, running, deployments };
  }, [runs]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <MetricCard
        label="Runs today"
        value={String(stats.todayCount)}
        icon={<Activity size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
      />
      <MetricCard
        label="Pass rate"
        value={`${stats.passRate}%`}
        icon={<TrendingUp size={14} strokeWidth={1.5} className="text-emerald-400" />}
        accent={stats.passRate >= 80 ? "emerald" : stats.passRate >= 50 ? "amber" : "red"}
      />
      <MetricCard
        label="Avg duration"
        value={formatDuration(stats.avgDuration)}
        icon={<Timer size={14} strokeWidth={1.5} className="text-amber-400/80" />}
      />
      <MetricCard
        label="Deployments"
        value={String(stats.deployments.length)}
        icon={<Rocket size={14} strokeWidth={1.5} className="text-violet-400" />}
      />
    </div>
  );
}

export function SprintPipelineSummary({ runs }: { runs: PipelineRunPayload[] }) {
  const stats = useMemo(() => {
    const completed = runs.filter((r) => r.state !== "IN_PROGRESS" && r.state !== "PAUSED");
    const passed = completed.filter((r) => r.state === "SUCCESSFUL");
    const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
    const deployments = runs.filter((r) => r.isDeployment);
    const ticketKeys = new Set(runs.map((r) => r.ticketKey).filter(Boolean));
    return { total: runs.length, passRate, deployments: deployments.length, tickets: ticketKeys.size };
  }, [runs]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <MetricCard
        label="Sprint runs"
        value={String(stats.total)}
        icon={<Activity size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
      />
      <MetricCard
        label="Pass rate"
        value={`${stats.passRate}%`}
        icon={<TrendingUp size={14} strokeWidth={1.5} className="text-emerald-400" />}
        accent={stats.passRate >= 80 ? "emerald" : stats.passRate >= 50 ? "amber" : "red"}
      />
      <MetricCard
        label="Deployments"
        value={String(stats.deployments)}
        icon={<Rocket size={14} strokeWidth={1.5} className="text-violet-400" />}
      />
      <MetricCard
        label="Tickets"
        value={String(stats.tickets)}
        icon={<Filter size={14} strokeWidth={1.5} className="text-amber-400/80" />}
      />
    </div>
  );
}
