"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Loader2,
  OctagonX,
  ExternalLink,
  RefreshCw,
  Filter,
  Rocket,
  Timer,
  TrendingUp,
  Activity,
  ChevronDown,
} from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePipelines } from "@/hooks/usePipelines";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";

// -- Helpers --

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function stateIcon(state: PipelineRunPayload["state"], size = 13) {
  switch (state) {
    case "SUCCESSFUL":
      return <CheckCircle2 size={size} strokeWidth={2} className="text-emerald-400" />;
    case "FAILED":
      return <XCircle size={size} strokeWidth={2} className="text-red-400" />;
    case "IN_PROGRESS":
      return <Loader2 size={size} strokeWidth={2} className="text-[var(--color-brand-400)] animate-spin" />;
    case "STOPPED":
      return <OctagonX size={size} strokeWidth={2} className="text-amber-400/70" />;
  }
}

function stateLabel(state: PipelineRunPayload["state"]): string {
  switch (state) {
    case "SUCCESSFUL": return "Passed";
    case "FAILED": return "Failed";
    case "IN_PROGRESS": return "Running";
    case "STOPPED": return "Stopped";
  }
}

// -- Metrics --

function PipelineMetrics({ runs }: { runs: PipelineRunPayload[] }) {
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

function MetricCard({
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
        <span className="text-[11px] font-medium text-white/35 uppercase tracking-wider">{label}</span>
      </div>
      <span className="relative font-[var(--font-display)] text-[22px] font-bold tracking-tight text-white/90">
        {value}
      </span>
    </Card>
  );
}

// -- Running Section --

function RunningSection({ runs }: { runs: PipelineRunPayload[] }) {
  const running = runs.filter((r) => r.state === "IN_PROGRESS");
  if (running.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Currently running ({running.length})
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {running.map((run) => (
          <RunningCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function RunningCard({ run }: { run: PipelineRunPayload }) {
  return (
    <Card className="relative overflow-hidden px-4 py-3 border-[var(--color-brand-500)]/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(26,111,194,0.08),transparent_70%)]" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 size={14} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)] animate-spin" />
          <span className="text-[12px] font-mono font-medium text-white/70 truncate">
            #{run.buildNumber}
          </span>
          <span className="text-[11px] text-white/30 truncate">{run.repo}</span>
        </div>
        {run.ticketKey && (
          <Link
            href={`/tickets/${run.ticketKey}`}
            className="shrink-0 text-[11px] font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
          >
            {run.ticketKey}
          </Link>
        )}
      </div>
      <p className="relative mt-1.5 text-[12px] text-white/40 truncate">
        <GitBranch size={11} strokeWidth={1.5} className="inline-block mr-1 -mt-px" />
        {run.branchName}
      </p>
    </Card>
  );
}

// -- Pipeline Table --

function PipelineTable({
  runs,
  repoFilter,
}: {
  runs: PipelineRunPayload[];
  repoFilter: string | null;
}) {
  const filtered = repoFilter ? runs.filter((r) => r.repo === repoFilter) : runs;

  if (filtered.length === 0) {
    return (
      <Card variant="dashed" className="px-6 py-12">
        <EmptyState
          icon={<GitBranch size={20} strokeWidth={1.5} className="text-white/30" />}
          title="No pipeline runs"
          description={repoFilter ? `No runs found for "${repoFilter}".` : "Pipeline data will appear here once Bitbucket is configured and a sync completes."}
        />
      </Card>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] gap-x-3 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-[10px] font-medium text-white/30 uppercase tracking-wider">
        <span>Pipeline</span>
        <span>Branch</span>
        <span className="text-center">Ticket</span>
        <span className="text-center">Status</span>
        <span className="text-right">Duration</span>
        <span className="text-right">When</span>
        <span />
      </div>

      {/* Rows */}
      {filtered.map((run) => (
        <PipelineRow key={run.id} run={run} />
      ))}
    </div>
  );
}

function PipelineRow({ run }: { run: PipelineRunPayload }) {
  const isFailed = run.state === "FAILED";

  return (
    <div
      className={`group grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] gap-x-3 items-center px-4 py-2.5 border-b border-white/[0.04] last:border-b-0 transition-colors duration-150 hover:bg-white/[0.02] ${
        isFailed ? "bg-red-500/[0.03]" : ""
      }`}
    >
      {/* Pipeline info */}
      <div className="flex items-center gap-2 min-w-0">
        {run.isDeployment ? (
          <Rocket size={12} strokeWidth={1.5} className="shrink-0 text-violet-400/70" />
        ) : (
          <GitBranch size={12} strokeWidth={1.5} className="shrink-0 text-white/20" />
        )}
        <span className="text-[12px] font-mono font-medium text-white/70 truncate">
          #{run.buildNumber}
        </span>
        <span className="text-[11px] text-white/25 truncate">{run.repo}</span>
        {run.environment && (
          <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400/80">
            {run.environment}
          </span>
        )}
      </div>

      {/* Branch */}
      <span className="text-[12px] text-white/40 truncate">{run.branchName}</span>

      {/* Ticket */}
      <div className="flex justify-center min-w-[72px]">
        {run.ticketKey ? (
          <Link
            href={`/tickets/${run.ticketKey}`}
            className="text-[11px] font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
          >
            {run.ticketKey}
          </Link>
        ) : (
          <span className="text-[11px] text-white/15">-</span>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-center gap-1.5 min-w-[80px]">
        {stateIcon(run.state)}
        <span className={`text-[11px] font-medium ${
          run.state === "SUCCESSFUL" ? "text-emerald-400/80" :
          run.state === "FAILED" ? "text-red-400/80" :
          run.state === "IN_PROGRESS" ? "text-[var(--color-brand-400)]" :
          "text-amber-400/60"
        }`}>
          {stateLabel(run.state)}
        </span>
      </div>

      {/* Duration */}
      <span className="text-[11px] text-white/30 text-right min-w-[60px] tabular-nums">
        {formatDuration(run.durationSeconds)}
      </span>

      {/* Timestamp */}
      <span className="text-[11px] text-white/25 text-right min-w-[64px] tabular-nums">
        {formatTimeAgo(run.createdAt)}
      </span>

      {/* External link */}
      <div className="flex justify-end min-w-[28px]">
        {run.pipelineUrl && (
          <a
            href={run.pipelineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-6 w-6 rounded-md text-white/15 hover:text-white/40 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer opacity-0 group-hover:opacity-100"
            title="Open in Bitbucket"
          >
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        )}
      </div>
    </div>
  );
}

// -- Repo Filter --

function RepoFilter({
  repos,
  selected,
  onSelect,
}: {
  repos: string[];
  selected: string | null;
  onSelect: (repo: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (repos.length <= 1) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {selected || "All repos"}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
                !selected ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              All repos
            </button>
            {repos.map((repo) => (
              <button
                key={repo}
                type="button"
                onClick={() => { onSelect(repo); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
                  selected === repo ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {repo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Main Page --

export default function PipelinesPage() {
  const { runs, hasRunning, isLoading, refresh } = usePipelines({ limit: 100 });
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const repos = useMemo(() => {
    const set = new Set(runs.map((r) => r.repo));
    return Array.from(set).sort();
  }, [runs]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<GitBranch size={16} strokeWidth={1.5} />}
        actions={
          <div className="flex items-center gap-2">
            {hasRunning && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-brand-400)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
                Live
              </span>
            )}
            <RepoFilter repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={<RefreshCw size={13} strokeWidth={1.5} className={refreshing ? "animate-spin" : ""} />}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh pipelines"
            />
          </div>
        }
      >
        <ViewHeaderTitle>Pipelines</ViewHeaderTitle>
        {hasRunning && (
          <span className="ml-2 rounded-md bg-[var(--color-brand-500)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
            Polling every 30s
          </span>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        <div className="max-w-6xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/20">
              <Loader2 size={24} strokeWidth={1.5} className="animate-spin mb-3" />
              <span className="text-[13px]">Loading pipelines...</span>
            </div>
          ) : (
            <>
              <PipelineMetrics runs={runs} />
              <RunningSection runs={runs} />
              <PipelineTable runs={runs} repoFilter={repoFilter} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
