"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  GitBranch,
  GitPullRequest,
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
  ChevronUp,
  Bell,
  Settings,
  Pause,
  User,
  Calendar,
  Search,
} from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/ui/Button";
import { useNotification } from "@/hooks/useNotification";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePipelines, useDeploySettings } from "@/hooks/usePipelines";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";

// -- Filter Persistence --

const STORAGE_KEY = "bridge:pipeline-filters";

interface PersistedFilters {
  sprints?: string[];
  creators?: string[];
  status?: StatusFilterValue;
  dateRange?: DateRangeValue;
  repo?: string | null;
}

function loadFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFilters(filters: PersistedFilters) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* noop */ }
}

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
    case "PAUSED":
      return <Pause size={size} strokeWidth={2} className="text-amber-400" />;
    case "STOPPED":
      return <OctagonX size={size} strokeWidth={2} className="text-amber-400/70" />;
  }
}

function stateLabel(state: PipelineRunPayload["state"]): string {
  switch (state) {
    case "SUCCESSFUL": return "Passed";
    case "FAILED": return "Failed";
    case "PAUSED": return "Paused";
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
  const active = runs.filter((r) => r.state === "IN_PROGRESS" || r.state === "PAUSED");
  if (active.length === 0) return null;

  const runningCount = active.filter((r) => r.state === "IN_PROGRESS").length;
  const pausedCount = active.filter((r) => r.state === "PAUSED").length;
  const label = [
    runningCount > 0 ? `${runningCount} running` : null,
    pausedCount > 0 ? `${pausedCount} paused` : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2 w-2 rounded-full ${runningCount > 0 ? "bg-[var(--color-brand-400)] animate-pulse" : "bg-amber-400"}`} />
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Active ({label})
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {active.map((run) => (
          <RunningCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function RunningCard({ run }: { run: PipelineRunPayload }) {
  const isPaused = run.state === "PAUSED";
  return (
    <Card className={`relative overflow-hidden px-4 py-3 ${isPaused ? "border-amber-500/20" : "border-[var(--color-brand-500)]/20"}`}>
      <div className={`pointer-events-none absolute inset-0 ${isPaused ? "bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.06),transparent_70%)]" : "bg-[radial-gradient(ellipse_at_top_left,rgba(26,111,194,0.08),transparent_70%)]"}`} />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isPaused ? (
            <Pause size={14} strokeWidth={2} className="shrink-0 text-amber-400" />
          ) : (
            <Loader2 size={14} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)] animate-spin" />
          )}
          {run.pipelineUrl ? (
            <a
              href={run.pipelineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-mono font-medium text-white/70 hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer truncate"
            >
              #{run.buildNumber}
            </a>
          ) : (
            <span className="text-[12px] font-mono font-medium text-white/70 truncate">
              #{run.buildNumber}
            </span>
          )}
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
  ticketTitleMap,
}: {
  runs: PipelineRunPayload[];
  repoFilter: string | null;
  ticketTitleMap?: Map<string, string>;
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
      <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_100px_80px_68px_54px] gap-x-4 px-4 py-2 bg-white/[0.02] border-b border-white/[0.06] text-[10px] font-medium text-white/25 uppercase tracking-wider">
        <span>Pipeline</span>
        <span>Branch</span>
        <span>Ticket</span>
        <span className="text-center">Status</span>
        <span className="text-right">Duration</span>
        <span className="text-right">When</span>
      </div>

      {/* Rows */}
      {filtered.map((run) => (
        <PipelineRow key={run.id} run={run} ticketTitleMap={ticketTitleMap} />
      ))}
    </div>
  );
}

function StatusPill({ state }: { state: PipelineRunPayload["state"] }) {
  const config = {
    SUCCESSFUL: { bg: "bg-emerald-500/10", text: "text-emerald-400/80", label: "Passed" },
    FAILED:     { bg: "bg-red-500/10", text: "text-red-400/80", label: "Failed" },
    IN_PROGRESS:{ bg: "bg-[var(--color-brand-500)]/10", text: "text-[var(--color-brand-400)]", label: "Running" },
    PAUSED:     { bg: "bg-amber-500/10", text: "text-amber-400/70", label: "Paused" },
    STOPPED:    { bg: "bg-white/[0.04]", text: "text-white/35", label: "Stopped" },
  }[state];

  return (
    <span className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.text}`}>
      {stateIcon(state, 11)}
      {config.label}
    </span>
  );
}

function PipelineRow({ run, ticketTitleMap }: { run: PipelineRunPayload; ticketTitleMap?: Map<string, string> }) {
  const isFailed = run.state === "FAILED";
  const allKeys = run.ticketKeys ?? (run.ticketKey ? [run.ticketKey] : []);
  const hasDetail = run.commitMessage || run.prTitle;

  return (
    <a
      href={run.pipelineUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block border-b border-white/[0.04] last:border-b-0 transition-colors duration-150 hover:bg-white/[0.025] ${
        isFailed ? "bg-red-500/[0.02]" : ""
      }`}
    >
      {/* Primary row */}
      <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_100px_80px_68px_54px] gap-x-4 items-center px-4 py-2.5">
        {/* Pipeline: icon + number + repo + env badge */}
        <div className="flex items-center gap-2 min-w-0">
          {run.isDeployment ? (
            <Rocket size={13} strokeWidth={1.5} className="shrink-0 text-violet-400/60" />
          ) : (
            <GitBranch size={13} strokeWidth={1.5} className="shrink-0 text-white/15" />
          )}
          <span className="text-[12px] font-mono font-semibold text-white/70 group-hover:text-[var(--color-brand-400)] transition-colors duration-150">
            #{run.buildNumber}
          </span>
          <span className="text-[11px] text-white/20">{run.repo}</span>
          {run.environment && (
            <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-px text-[10px] font-medium text-violet-400/70">
              {run.environment}
            </span>
          )}
          {run.creator && (
            <span className="hidden lg:flex items-center gap-1 ml-auto shrink-0 text-[11px] text-white/20">
              <User size={10} strokeWidth={1.5} className="text-white/15" />
              {run.creator}
            </span>
          )}
        </div>

        {/* Branch */}
        <span className="text-[12px] text-white/35 truncate">{run.branchName}</span>

        {/* Ticket */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {allKeys.length > 0 ? (
            allKeys.slice(0, 2).map((k) => (
              <Link
                key={k}
                href={`/tickets/${k}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer truncate"
              >
                {k}
              </Link>
            ))
          ) : (
            <span className="text-[11px] text-white/10">-</span>
          )}
        </div>

        {/* Status */}
        <div className="flex justify-center">
          <StatusPill state={run.state} />
        </div>

        {/* Duration */}
        <span className="text-[11px] text-white/25 text-right tabular-nums">
          {formatDuration(run.durationSeconds)}
        </span>

        {/* When */}
        <span className="text-[11px] text-white/20 text-right tabular-nums">
          {formatTimeAgo(run.createdAt)}
        </span>
      </div>

      {/* Detail row: commit message + PR (only when present) */}
      {hasDetail && (
        <div className="flex items-center gap-3 px-4 pb-2.5 -mt-1 pl-[42px]">
          {run.commitMessage && (
            <span className="text-[11px] text-white/20 truncate">{run.commitMessage}</span>
          )}
          {run.prTitle && run.prUrl && (
            <span
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(run.prUrl!, "_blank"); }}
              className="shrink-0 flex items-center gap-1 text-[11px] text-white/25 hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer"
            >
              <GitPullRequest size={10} strokeWidth={1.5} />
              PR
              {run.prAuthor && <span className="text-white/15">by {run.prAuthor}</span>}
            </span>
          )}
        </div>
      )}
    </a>
  );
}

// -- Status Filter --

type StatusFilterValue = "all" | "failed" | "successful" | "running" | "deployments";

function StatusFilter({
  selected,
  onSelect,
}: {
  selected: StatusFilterValue;
  onSelect: (v: StatusFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: { value: StatusFilterValue; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "failed", label: "Failed only" },
    { value: "successful", label: "Passed only" },
    { value: "running", label: "Running only" },
    { value: "deployments", label: "Deployments only" },
  ];

  const current = options.find((o) => o.value === selected) ?? options[0];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected !== "all" ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {current.label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
                  selected === opt.value ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Date Range Filter --

type DateRangeValue = "all" | "today" | "week" | "month";

function DateRangeFilter({
  selected,
  onSelect,
}: {
  selected: DateRangeValue;
  onSelect: (v: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: { value: DateRangeValue; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];

  const current = options.find((o) => o.value === selected) ?? options[0];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Calendar size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected !== "all" ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {current.label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
                  selected === opt.value ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Creator Filter (multi-select with search) --

function CreatorFilter({
  creators,
  selected,
  onToggle,
  onClear,
}: {
  creators: string[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (creators.length === 0) return null;

  const filtered = search
    ? creators.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : creators;

  const label = selected.length === 0
    ? "Creator"
    : selected.length === 1
    ? selected[0]
    : `${selected.length} creators`;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<User size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Search */}
            <div className="px-2 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04]">
                <Search size={11} strokeWidth={1.5} className="text-white/20 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search creators..."
                  autoFocus
                  className="flex-1 bg-transparent text-[12px] text-white/60 placeholder:text-white/20 outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[260px] py-1">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onClear(); }}
                  className="w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 text-white/40 hover:bg-white/[0.04]"
                >
                  Clear selection
                </button>
              )}
              {filtered.map((name) => {
                const isChecked = selected.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggle(name)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
                      isChecked ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border text-[9px] shrink-0 ${
                      isChecked ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]" : "border-white/15"
                    }`}>
                      {isChecked && "\u2713"}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// -- Deployment Timeline --

function DeploymentTimeline({ runs }: { runs: PipelineRunPayload[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const deployments = runs.filter((r) => r.isDeployment && r.state !== "IN_PROGRESS");
  if (deployments.length === 0) return null;

  // Group by date
  const byDate = new Map<string, PipelineRunPayload[]>();
  for (const d of deployments) {
    const date = new Date(d.completedAt ?? d.createdAt).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(d);
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 cursor-pointer group"
      >
        <Rocket size={14} strokeWidth={1.5} className="text-violet-400/60" />
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider group-hover:text-white/70 transition-colors duration-150">
          Deployment Timeline
        </span>
        <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400/60 tabular-nums">
          {deployments.length}
        </span>
        {collapsed ? (
          <ChevronDown size={12} strokeWidth={1.5} className="text-white/20" />
        ) : (
          <ChevronUp size={12} strokeWidth={1.5} className="text-white/20" />
        )}
      </button>
      {!collapsed && (
        <div className="space-y-4">
          {Array.from(byDate.entries()).map(([date, deploys]) => (
            <div key={date}>
              <span className="text-[11px] font-medium text-white/25 uppercase tracking-wider">{date}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {deploys.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                      d.state === "SUCCESSFUL"
                        ? "border-emerald-500/15 bg-emerald-500/[0.04]"
                        : d.state === "FAILED"
                        ? "border-red-500/15 bg-red-500/[0.04]"
                        : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    {stateIcon(d.state, 12)}
                    <span className="font-medium text-white/60">{d.environment}</span>
                    {d.ticketKey && (
                      <Link
                        href={`/tickets/${d.ticketKey}`}
                        className="font-mono text-[11px] text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
                      >
                        {d.ticketKey}
                      </Link>
                    )}
                    <span className="text-[10px] text-white/20">{d.repo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Deploy Notification Settings --

function Toggle({ on, size = "sm", onToggle }: { on: boolean; size?: "sm" | "md"; onToggle: () => void }) {
  const isMd = size === "md";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative shrink-0 rounded-full transition-colors duration-150 cursor-pointer ${
        on ? "bg-[var(--color-brand-500)]" : "bg-white/10"
      } ${isMd ? "h-5 w-9" : "h-[18px] w-[32px]"}`}
    >
      <span
        className={`absolute rounded-full bg-white shadow-sm transition-transform duration-150 ${
          isMd
            ? `top-0.5 h-4 w-4 ${on ? "translate-x-4" : "translate-x-0.5"}`
            : `top-[3px] h-3 w-3 ${on ? "translate-x-[14px]" : "translate-x-[3px]"}`
        }`}
      />
    </button>
  );
}

function DeploySettingsPanel() {
  const { settings, update } = useDeploySettings();
  const { permission, requestPermission } = useNotification();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  function toggleEnabled() {
    if (!settings) return;
    const next = { ...settings, enabled: !settings.enabled };
    if (next.enabled && permission === "default") requestPermission();
    update(next);
  }

  function toggleEnvironment(env: string) {
    if (!settings) return;
    update({ ...settings, environments: { ...settings.environments, [env]: !settings.environments[env] } });
  }

  const enabledEnvCount = Object.values(settings.environments).filter(Boolean).length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon={<Bell size={13} strokeWidth={1.5} className={settings.enabled ? "text-[var(--color-brand-400)]" : ""} />}
        onClick={() => setOpen(!open)}
        title="Notification settings"
      />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-[280px] rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {/* Header */}
            <div className="px-4 pt-4 pb-3">
              <h3 className="text-[13px] font-semibold text-white/70">Notifications</h3>
              <p className="text-[11px] text-white/30 mt-0.5">
                Get notified when deployments complete for followed tickets.
              </p>
            </div>

            {permission === "denied" && (
              <div className="mx-4 mb-3 rounded-lg bg-red-500/[0.06] border border-red-500/10 px-3 py-2">
                <p className="text-[11px] text-red-400/80">
                  Browser notifications are blocked. Enable them in your browser settings.
                </p>
              </div>
            )}

            {/* Master toggle */}
            <div className="px-4 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[12px] text-white/50">Enable notifications</span>
                {settings.enabled && (
                  <span className="ml-2 text-[10px] text-white/20">{enabledEnvCount} env</span>
                )}
              </div>
              <Toggle on={settings.enabled} size="md" onToggle={toggleEnabled} />
            </div>

            {/* Per-environment toggles */}
            {settings.enabled && (
              <div className="border-t border-white/[0.06] px-4 py-3 space-y-2">
                <span className="text-[10px] font-medium text-white/20 uppercase tracking-wider">Environments</span>
                {Object.entries(settings.environments).map(([env, on]) => (
                  <div key={env} className="flex items-center justify-between py-0.5">
                    <span className={`text-[12px] ${on ? "text-white/50" : "text-white/25"}`}>{env}</span>
                    <Toggle on={on as boolean} onToggle={() => toggleEnvironment(env)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
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

// -- Loading Skeleton --

function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="px-4 py-3">
            <div className="h-3 w-16 rounded bg-white/[0.04] mb-3" style={{ animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 100}ms` }} />
            <div className="h-6 w-12 rounded bg-white/[0.06]" style={{ animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 100 + 50}ms` }} />
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
          <div className="h-3 w-64 rounded bg-white/[0.04]" />
        </div>
        {[0.9, 0.7, 0.85, 0.6, 0.75, 0.8, 0.65].map((w, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-b-0">
            <div className="h-3 rounded bg-white/[0.04]" style={{ width: `${w * 100}%`, animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncStatusBanner({ syncStatus, syncing }: {
  syncStatus: { watermark: string | null; remaining: number; lastNewRuns: number } | null;
  syncing: boolean;
}) {
  const isCatchingUp = syncStatus && syncStatus.remaining > 0;
  const watermarkAge = syncStatus?.watermark
    ? formatTimeAgo(syncStatus.watermark)
    : null;

  if (!syncing && !isCatchingUp) return null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 mb-6 ${
      isCatchingUp
        ? "border-amber-500/15 bg-amber-500/[0.04]"
        : "border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.04]"
    }`}>
      <Loader2 size={13} strokeWidth={2} className={`animate-spin ${isCatchingUp ? "text-amber-400" : "text-[var(--color-brand-400)]"}`} />
      <span className={`text-[12px] ${isCatchingUp ? "text-amber-400/80" : "text-[var(--color-brand-400)]/80"}`}>
        {isCatchingUp
          ? `Catching up on historical pipeline data... (synced up to ${watermarkAge})`
          : "Syncing latest pipeline data from Bitbucket..."
        }
      </span>
    </div>
  );
}

// -- Sprint Filter (multi-select with search) --

function SprintFilter({
  sprints,
  selected,
  onToggle,
  onClear,
}: {
  sprints: { id: number; name: string; state: string; hidden?: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = new Set(selected);

  const visibleSprints = sprints
    .filter((s) => !("hidden" in s && s.hidden))
    .filter((s) => s.state === "active" || s.state === "future" || s.state === "closed")
    .slice(0, 20);

  // Always include selected sprints even if not in the visible list
  const selectedNotVisible = sprints.filter((s) => selectedSet.has(String(s.id)) && !visibleSprints.some((v) => v.id === s.id));

  if (visibleSprints.length === 0 && selectedNotVisible.length === 0) return null;

  const current = visibleSprints.filter((s) => s.state === "active" || s.state === "future");
  const closed = visibleSprints.filter((s) => s.state === "closed");

  const filtered = (list: typeof visibleSprints) =>
    search ? list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : list;

  // Resolve label from all sprints (not just visible)
  const label = selected.length === 0
    ? "Sprint"
    : selected.length === 1
    ? sprints.find((s) => String(s.id) === selected[0])?.name ?? "1 sprint"
    : `${selected.length} sprints`;

  function renderItem(s: { id: number; name: string; state: string }, dimmed?: boolean) {
    const id = String(s.id);
    const isChecked = selected.includes(id);
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 ${
          isChecked ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : dimmed ? "text-white/35 hover:bg-white/[0.04]" : "text-white/50 hover:bg-white/[0.04]"
        }`}
      >
        <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border text-[9px] shrink-0 ${
          isChecked ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]" : "border-white/15"
        }`}>
          {isChecked && "\u2713"}
        </span>
        {s.name}
      </button>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Search */}
            <div className="px-2 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04]">
                <Search size={11} strokeWidth={1.5} className="text-white/20 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sprints..."
                  autoFocus
                  className="flex-1 bg-transparent text-[12px] text-white/60 placeholder:text-white/20 outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[300px] py-1">
              {/* Clear button */}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onClear(); }}
                  className="w-full px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors duration-150 text-white/40 hover:bg-white/[0.04]"
                >
                  Clear selection
                </button>
              )}

              {/* Selected sprints not in the standard list */}
              {filtered(selectedNotVisible).map((s) => renderItem(s))}
              {filtered(selectedNotVisible).length > 0 && (filtered(current).length > 0 || filtered(closed).length > 0) && (
                <div className="mx-3 my-1 border-t border-white/[0.06]" />
              )}

              {/* Active / future */}
              {filtered(current).map((s) => renderItem(s))}

              {/* Closed */}
              {filtered(closed).length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-white/[0.06]" />
                  <span className="block px-3 py-1 text-[10px] font-medium text-white/20 uppercase tracking-wider">Recent</span>
                  {filtered(closed).map((s) => renderItem(s, true))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// -- Sprint Summary --

function SprintPipelineSummary({ runs }: { runs: PipelineRunPayload[] }) {
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

// -- Grouped by Ticket View --

function GroupedByTicketView({
  runs,
  ticketTitleMap,
}: {
  runs: PipelineRunPayload[];
  ticketTitleMap: Map<string, string>;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, PipelineRunPayload[]>();
    const noTicket: PipelineRunPayload[] = [];
    for (const run of runs) {
      const key = run.ticketKey;
      if (!key) {
        noTicket.push(run);
        continue;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(run);
    }
    // Sort groups by most recent pipeline first
    const sorted = [...map.entries()].sort((a, b) => {
      const aDate = a[1][0]?.createdAt ?? "";
      const bDate = b[1][0]?.createdAt ?? "";
      return bDate.localeCompare(aDate);
    });
    if (noTicket.length > 0) sorted.push(["_unlinked", noTicket]);
    return sorted;
  }, [runs]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map(([ticketKey, ticketRuns]) => {
        const title = ticketKey === "_unlinked" ? null : ticketTitleMap.get(ticketKey);
        const passCount = ticketRuns.filter((r) => r.state === "SUCCESSFUL").length;
        const failCount = ticketRuns.filter((r) => r.state === "FAILED").length;

        return (
          <div key={ticketKey} className="rounded-xl border border-white/[0.08] overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
              {ticketKey !== "_unlinked" ? (
                <Link
                  href={`/tickets/${ticketKey}`}
                  className="text-[12px] font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
                >
                  {ticketKey}
                </Link>
              ) : (
                <span className="text-[12px] font-medium text-white/30">Unlinked pipelines</span>
              )}
              {title && (
                <span className="text-[12px] text-white/40 truncate">{title}</span>
              )}
              <div className="ml-auto flex items-center gap-3 text-[11px]">
                {passCount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400/70">
                    <CheckCircle2 size={11} strokeWidth={2} /> {passCount}
                  </span>
                )}
                {failCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400/70">
                    <XCircle size={11} strokeWidth={2} /> {failCount}
                  </span>
                )}
                <span className="text-white/25">{ticketRuns.length} run{ticketRuns.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Compact pipeline rows */}
            {ticketRuns.map((run) => (
              <div
                key={run.id}
                className={`flex items-center gap-3 px-4 py-2 border-b border-white/[0.04] last:border-b-0 transition-colors duration-150 hover:bg-white/[0.02] ${
                  run.state === "FAILED" ? "bg-red-500/[0.03]" : ""
                }`}
              >
                {stateIcon(run.state)}
                <a
                  href={run.pipelineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-mono font-medium text-white/70 hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer"
                >
                  #{run.buildNumber}
                </a>
                <span className="text-[11px] text-white/25 truncate">{run.repo}</span>
                {run.environment && (
                  <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400/80">
                    {run.environment}
                  </span>
                )}
                <span className="text-[12px] text-white/30 truncate flex-1">{run.branchName}</span>
                {run.commitMessage && (
                  <span className="hidden lg:block text-[11px] text-white/20 truncate max-w-[200px]">{run.commitMessage}</span>
                )}
                <span className="text-[11px] text-white/25 tabular-nums shrink-0">
                  {formatTimeAgo(run.createdAt)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// -- Main Page --

const PAGE_SIZE = 50;

function getDateCutoff(range: DateRangeValue): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (range === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday-based week
    now.setDate(now.getDate() - diff);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (range === "month") {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  return null;
}

export default function PipelinesPage() {
  // Load persisted filters from localStorage
  const initialFilters = useRef(loadFilters());

  const [repoFilter, setRepoFilter] = useState<string | null>(initialFilters.current.repo ?? null);
  const [sprintFilters, setSprintFilters] = useState<string[]>(initialFilters.current.sprints ?? []);
  const [sprintAutoSelected, setSprintAutoSelected] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(initialFilters.current.status ?? "all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(initialFilters.current.dateRange ?? "all");
  const [creatorFilters, setCreatorFilters] = useState<string[]>(initialFilters.current.creators ?? []);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  // Persist filters to localStorage
  useEffect(() => {
    saveFilters({
      sprints: sprintFilters,
      creators: creatorFilters,
      status: statusFilter,
      dateRange,
      repo: repoFilter,
    });
  }, [sprintFilters, creatorFilters, statusFilter, dateRange, repoFilter]);

  const { data: sprints } = useJiraSprints();

  // Default to active sprint on first load (only if no persisted filters)
  if (sprints && sprintFilters.length === 0 && !sprintAutoSelected && !initialFilters.current.sprints?.length) {
    const active = sprints.find((s) => s.state === "active");
    if (active) {
      setSprintFilters([String(active.id)]);
      setSprintAutoSelected(true);
    }
  }

  // Toggle helpers
  const toggleSprint = useCallback((id: string) => {
    setSprintFilters((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, []);

  const toggleCreator = useCallback((name: string) => {
    setCreatorFilters((prev) => prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]);
  }, []);

  // For ticket fetching: use first selected sprint (useTickets takes single ID)
  // When multiple sprints: fetch __all__ and filter client-side
  const sprintTicketFetchKey = sprintFilters.length === 1 ? sprintFilters[0] : sprintFilters.length > 1 ? "__all__" : null;
  const { data: sprintTickets } = useTickets(sprintTicketFetchKey);

  // Filter tickets to selected sprints when multi-select
  const filteredSprintTickets = useMemo(() => {
    if (!sprintTickets || sprintFilters.length === 0) return sprintTickets ?? null;
    if (sprintFilters.length === 1) return sprintTickets;
    // Multi-sprint: need to match by sprint name
    const sprintNames = new Set<string>();
    if (sprints) {
      for (const sf of sprintFilters) {
        const s = sprints.find((sp) => String(sp.id) === sf);
        if (s) sprintNames.add(s.name);
      }
    }
    return sprintTickets.filter((t) => t.sprintId && sprintNames.has(t.sprintId));
  }, [sprintTickets, sprintFilters, sprints]);

  const sprintTicketKeys = sprintFilters.length > 0 && filteredSprintTickets
    ? filteredSprintTickets.map((t) => t.key)
    : undefined;

  // Build ticket key -> title map for sprint view
  const ticketTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    if (filteredSprintTickets) {
      for (const t of filteredSprintTickets) map.set(t.key, t.title);
    }
    return map;
  }, [filteredSprintTickets]);

  const { runs, hasRunning, syncing, syncStatus, isLoading, refresh } = usePipelines({
    limit: 200,
    sprintTickets: sprintTicketKeys,
  });

  const repos = useMemo(() => {
    const set = new Set(runs.map((r) => r.repo));
    return Array.from(set).sort();
  }, [runs]);

  const creators = useMemo(() => {
    const set = new Set(runs.map((r) => r.creator).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [runs]);

  // Apply all filters: repo, status, date range, creator
  const filteredRuns = useMemo(() => {
    let result = runs;

    if (repoFilter) result = result.filter((r) => r.repo === repoFilter);

    if (statusFilter !== "all") {
      if (statusFilter === "failed") result = result.filter((r) => r.state === "FAILED");
      else if (statusFilter === "successful") result = result.filter((r) => r.state === "SUCCESSFUL");
      else if (statusFilter === "running") result = result.filter((r) => r.state === "IN_PROGRESS" || r.state === "PAUSED");
      else if (statusFilter === "deployments") result = result.filter((r) => r.isDeployment);
    }

    const cutoff = getDateCutoff(dateRange);
    if (cutoff) result = result.filter((r) => new Date(r.createdAt) >= cutoff);

    if (creatorFilters.length > 0) {
      const creatorSet = new Set(creatorFilters);
      result = result.filter((r) => r.creator !== null && creatorSet.has(r.creator));
    }

    return result;
  }, [runs, repoFilter, statusFilter, dateRange, creatorFilters]);

  // Pagination: slice for display
  const paginatedRuns = useMemo(() => filteredRuns.slice(0, visibleCount), [filteredRuns, visibleCount]);
  const hasMore = filteredRuns.length > visibleCount;

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [repoFilter, statusFilter, dateRange, creatorFilters, sprintFilters]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  // Keyboard shortcuts
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleRefresh();
    }
    if (e.key === "f" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setStatusFilter((prev) => {
        const order: StatusFilterValue[] = ["all", "failed", "successful", "running", "deployments"];
        const idx = order.indexOf(prev);
        return order[(idx + 1) % order.length];
      });
    }
    if (e.key === "s" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (sprints) {
        if (sprintFilters.length > 0) {
          setSprintFilters([]);
        } else {
          const active = sprints.find((s) => s.state === "active");
          if (active) setSprintFilters([String(active.id)]);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprints, sprintFilters]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  const activeFilterCount = [
    statusFilter !== "all",
    dateRange !== "all",
    creatorFilters.length > 0,
    repoFilter !== null,
  ].filter(Boolean).length;

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
            {sprints && <SprintFilter sprints={sprints} selected={sprintFilters} onToggle={toggleSprint} onClear={() => setSprintFilters([])} />}
            <RepoFilter repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
            <StatusFilter selected={statusFilter} onSelect={setStatusFilter} />
            <DateRangeFilter selected={dateRange} onSelect={setDateRange} />
            <CreatorFilter creators={creators} selected={creatorFilters} onToggle={toggleCreator} onClear={() => setCreatorFilters([])} />
            <DeploySettingsPanel />
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={<RefreshCw size={13} strokeWidth={1.5} className={refreshing ? "animate-spin" : ""} />}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh pipelines (R)"
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
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setDateRange("all");
              setCreatorFilters([]);
              setRepoFilter(null);
            }}
            className="ml-2 rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/35 cursor-pointer hover:bg-white/[0.1] hover:text-white/50 transition-colors duration-150"
            title="Clear all filters"
          >
            {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active &times;
          </button>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        <div className="max-w-6xl">
          {isLoading ? (
            <PipelineSkeleton />
          ) : (
            <>
              <SyncStatusBanner syncStatus={syncStatus} syncing={syncing && runs.length === 0} />
              {sprintFilters.length > 0 ? (
                <>
                  <SprintPipelineSummary runs={filteredRuns} />
                  <RunningSection runs={paginatedRuns} />
                  <DeploymentTimeline runs={paginatedRuns} />
                  <GroupedByTicketView runs={paginatedRuns} ticketTitleMap={ticketTitleMap} />
                </>
              ) : (
                <>
                  <PipelineMetrics runs={filteredRuns} />
                  <RunningSection runs={paginatedRuns} />
                  <DeploymentTimeline runs={paginatedRuns} />
                  <PipelineTable runs={paginatedRuns} repoFilter={null} ticketTitleMap={ticketTitleMap} />
                </>
              )}

              {/* Pagination: show more */}
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  >
                    Show more ({filteredRuns.length - visibleCount} remaining)
                  </Button>
                </div>
              )}

              {/* Keyboard shortcuts hint */}
              <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-white/15">
                <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/25 font-mono">R</kbd> Refresh</span>
                <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/25 font-mono">F</kbd> Cycle status filter</span>
                <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/25 font-mono">S</kbd> Toggle sprint</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
