"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Loader2,
  OctagonX,
  Rocket,
  Pause,
  User,
} from "lucide-react";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";
import { formatTimeAgo, formatDuration } from "./pipeline-helpers";

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

// -- Running Section --

export function RunningSection({ runs }: { runs: PipelineRunPayload[] }) {
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
        <span className="text-body-sm font-medium text-text-secondary uppercase tracking-wider">
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
      <div className={`pointer-events-none absolute inset-0 ${isPaused ? "bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--color-status-caution)_6%,transparent),transparent_70%)]" : "bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--color-brand-500)_8%,transparent),transparent_70%)]"}`} />
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
              className="text-body-sm font-mono font-medium text-text-secondary hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer truncate"
            >
              #{run.buildNumber}
            </a>
          ) : (
            <span className="text-body-sm font-mono font-medium text-text-secondary truncate">
              #{run.buildNumber}
            </span>
          )}
          <span className="text-label text-text-tertiary truncate">{run.repo}</span>
        </div>
        {run.ticketKey && (
          <Link
            href={`/tickets/${run.ticketKey}`}
            className="shrink-0 text-label font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
          >
            {run.ticketKey}
          </Link>
        )}
      </div>
      <p className="relative mt-1.5 text-body-sm text-text-tertiary truncate">
        <GitBranch size={11} strokeWidth={1.5} className="inline-block mr-1 -mt-px" />
        {run.branchName}
      </p>
    </Card>
  );
}

// -- Status Pill --

export function StatusPill({ state }: { state: PipelineRunPayload["state"] }) {
  const config = {
    SUCCESSFUL: { bg: "bg-emerald-500/10", text: "text-emerald-400/80", label: "Passed" },
    FAILED:     { bg: "bg-red-500/10", text: "text-red-400/80", label: "Failed" },
    IN_PROGRESS:{ bg: "bg-[var(--color-brand-500)]/10", text: "text-[var(--color-brand-400)]", label: "Running" },
    PAUSED:     { bg: "bg-amber-500/10", text: "text-amber-400/70", label: "Paused" },
    STOPPED:    { bg: "bg-overlay-subtle", text: "text-text-tertiary", label: "Stopped" },
  }[state];

  return (
    <span className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-0.5 text-label font-medium ${config.bg} ${config.text}`}>
      {stateIcon(state, 11)}
      {config.label}
    </span>
  );
}

// -- Pipeline Row --

function PipelineRow({ run, ticketTitleMap }: { run: PipelineRunPayload; ticketTitleMap?: Map<string, string> }) {
  const isFailed = run.state === "FAILED";
  const allKeys = run.ticketKeys ?? (run.ticketKey ? [run.ticketKey] : []);
  const hasDetail = run.commitMessage || run.prTitle;

  return (
    <a
      href={run.pipelineUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block border-b border-border-subtle last:border-b-0 transition-colors duration-150 hover:bg-overlay-subtle ${
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
            <GitBranch size={13} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          )}
          <span className="text-body-sm font-mono font-semibold text-text-secondary group-hover:text-[var(--color-brand-400)] transition-colors duration-150">
            #{run.buildNumber}
          </span>
          <span className="text-label text-text-muted">{run.repo}</span>
          {run.environment && (
            <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-px text-caption font-medium text-violet-400/70">
              {run.environment}
            </span>
          )}
          {run.creator && (
            <span className="hidden lg:flex items-center gap-1 ml-auto shrink-0 text-label text-text-muted">
              <User size={10} strokeWidth={1.5} className="text-text-muted" />
              {run.creator}
            </span>
          )}
        </div>

        {/* Branch */}
        <span className="text-body-sm text-text-tertiary truncate">{run.branchName}</span>

        {/* Ticket */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {allKeys.length > 0 ? (
            allKeys.slice(0, 2).map((k) => (
              <Link
                key={k}
                href={`/tickets/${k}`}
                onClick={(e) => e.stopPropagation()}
                className="text-label font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer truncate"
              >
                {k}
              </Link>
            ))
          ) : (
            <span className="text-label text-text-muted">-</span>
          )}
        </div>

        {/* Status */}
        <div className="flex justify-center">
          <StatusPill state={run.state} />
        </div>

        {/* Duration */}
        <span className="text-label text-text-muted text-right tabular-nums">
          {formatDuration(run.durationSeconds)}
        </span>

        {/* When */}
        <span className="text-label text-text-muted text-right tabular-nums">
          {formatTimeAgo(run.createdAt)}
        </span>
      </div>

      {/* Detail row: commit message + PR (only when present) */}
      {hasDetail && (
        <div className="flex items-center gap-3 px-4 pb-2.5 -mt-1 pl-[42px]">
          {run.commitMessage && (
            <span className="text-label text-text-muted truncate">{run.commitMessage}</span>
          )}
          {run.prTitle && run.prUrl && (
            <span
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(run.prUrl!, "_blank"); }}
              className="shrink-0 flex items-center gap-1 text-label text-text-muted hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer"
            >
              <GitPullRequest size={10} strokeWidth={1.5} />
              PR
              {run.prAuthor && <span className="text-text-muted">by {run.prAuthor}</span>}
            </span>
          )}
        </div>
      )}
    </a>
  );
}

// -- Pipeline Table --

export function PipelineTable({
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
          icon={<GitBranch size={20} strokeWidth={1.5} className="text-text-tertiary" />}
          title="No pipeline runs"
          description={repoFilter ? `No runs found for "${repoFilter}".` : "Pipeline data will appear here once Bitbucket is configured and a sync completes."}
        />
      </Card>
    );
  }

  return (
    <div className="rounded-xl border border-border-strong overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_100px_80px_68px_54px] gap-x-4 px-4 py-2 bg-overlay-subtle border-b border-border-default text-caption font-medium text-text-muted uppercase tracking-wider">
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

// -- Grouped by Ticket View --

export function GroupedByTicketView({
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
          <div key={ticketKey} className="rounded-xl border border-border-strong overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-overlay-subtle border-b border-border-default">
              {ticketKey !== "_unlinked" ? (
                <Link
                  href={`/tickets/${ticketKey}`}
                  className="text-body-sm font-mono font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
                >
                  {ticketKey}
                </Link>
              ) : (
                <span className="text-body-sm font-medium text-text-tertiary">Unlinked pipelines</span>
              )}
              {title && (
                <span className="text-body-sm text-text-tertiary truncate">{title}</span>
              )}
              <div className="ml-auto flex items-center gap-3 text-label">
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
                <span className="text-text-muted">{ticketRuns.length} run{ticketRuns.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Compact pipeline rows */}
            {ticketRuns.map((run) => (
              <div
                key={run.id}
                className={`flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-b-0 transition-colors duration-150 hover:bg-overlay-subtle ${
                  run.state === "FAILED" ? "bg-red-500/[0.03]" : ""
                }`}
              >
                {stateIcon(run.state)}
                <a
                  href={run.pipelineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body-sm font-mono font-medium text-text-secondary hover:text-[var(--color-brand-400)] transition-colors duration-150 cursor-pointer"
                >
                  #{run.buildNumber}
                </a>
                <span className="text-label text-text-muted truncate">{run.repo}</span>
                {run.environment && (
                  <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-caption font-medium text-violet-400/80">
                    {run.environment}
                  </span>
                )}
                <span className="text-body-sm text-text-tertiary truncate flex-1">{run.branchName}</span>
                {run.commitMessage && (
                  <span className="hidden lg:block text-label text-text-muted truncate max-w-[200px]">{run.commitMessage}</span>
                )}
                <span className="text-label text-text-muted tabular-nums shrink-0">
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
