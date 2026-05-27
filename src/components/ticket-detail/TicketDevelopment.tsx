"use client";

import {
  GitPullRequest,
  GitBranch,
  GitCommit,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  MessageSquare,
  FileCode2,
  OctagonX,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { useDevInfo } from "@/hooks/useSprintBoard";
import { usePipelines } from "@/hooks/usePipelines";
import { Activity } from "lucide-react";
import type {
  DevInfoPayload,
  DevPullRequest,
  DevBranch,
  DevBuild,
  DevDeployment,
} from "@/app/api/tickets/[key]/dev-info/route";

function relativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const PR_STATUS_STYLES: Record<DevPullRequest["status"], { bg: string; text: string }> = {
  OPEN: { bg: "var(--color-status-warning-subtle)", text: "var(--color-status-warning)" },
  MERGED: { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)" },
  DECLINED: { bg: "var(--color-status-error-subtle)", text: "rgba(229, 83, 75, 0.5)" },
};

function BuildStateIcon({ state, size = 13 }: { state: string; size?: number }) {
  if (state === "SUCCESSFUL") return <CheckCircle2 size={size} strokeWidth={1.5} style={{ color: "var(--color-status-success)" }} />;
  if (state === "FAILED") return <XCircle size={size} strokeWidth={1.5} style={{ color: "var(--color-status-error)" }} />;
  if (state === "STOPPED") return <OctagonX size={size} strokeWidth={1.5} className="text-text-muted" />;
  if (state === "PAUSED") return <Circle size={size} strokeWidth={1.5} className="text-amber-400" />;
  return <Loader2 size={size} strokeWidth={1.5} className="animate-spin" style={{ color: "var(--color-status-warning)" }} />;
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 pb-3">
      <span className="text-text-muted">{icon}</span>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="rounded-md bg-overlay-default px-1.5 py-0.5 text-label tabular-nums text-text-tertiary">{count}</span>
      )}
    </div>
  );
}

function PrCard({ pr }: { pr: DevPullRequest }) {
  const style = PR_STATUS_STYLES[pr.status];
  const approvedCount = pr.reviewers.filter((r) => r.approved).length;
  const totalReviewers = pr.reviewers.length;

  return (
    <div className="rounded-lg border border-border-default bg-overlay-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <GitPullRequest size={15} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sm font-medium text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease" }}
            >
              {pr.title}
            </a>
            <span
              className="shrink-0 rounded px-2 py-0.5 text-caption font-semibold uppercase tracking-wider"
              style={{ backgroundColor: style.bg, color: style.text }}
            >
              {pr.status}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-text-tertiary">
            {pr.author}
            <span className="text-text-muted"> in </span>
            <span className="font-medium text-text-muted">{pr.repo}</span>
            <span className="text-text-muted"> · </span>
            <span className="text-text-muted">{pr.sourceBranch}</span>
            <span className="text-text-muted"> -&gt; </span>
            <span className="text-text-muted">{pr.destBranch}</span>
          </p>
        </div>
        <span className="shrink-0 text-xs text-text-muted">{relativeDate(pr.createdAt)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
        {/* Reviewers */}
        {totalReviewers > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              {approvedCount === totalReviewers ? (
                <CheckCircle2 size={13} strokeWidth={1.5} style={{ color: "var(--color-status-success)" }} />
              ) : approvedCount > 0 ? (
                <Circle size={13} strokeWidth={1.5} style={{ color: "var(--color-status-warning)" }} />
              ) : (
                <Circle size={13} strokeWidth={1.5} className="text-text-muted" />
              )}
              {approvedCount}/{totalReviewers} approved
            </span>
            <span className="text-text-muted">
              ({pr.reviewers.map((r) => r.name).join(", ")})
            </span>
          </div>
        )}

        {/* Diff */}
        {pr.diffStats && (
          <span className="flex items-center gap-1.5">
            <FileCode2 size={13} strokeWidth={1.5} className="text-text-muted" />
            <span style={{ color: "var(--color-status-success)", opacity: 0.7 }}>+{pr.diffStats.linesAdded}</span>
            <span style={{ color: "var(--color-status-error)", opacity: 0.6 }}>-{pr.diffStats.linesRemoved}</span>
            <span className="text-text-muted">{pr.diffStats.filesChanged} files</span>
          </span>
        )}

        {/* Comments */}
        {pr.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={13} strokeWidth={1.5} className="text-text-muted" />
            {pr.commentCount} comment{pr.commentCount > 1 ? "s" : ""}
          </span>
        )}

        {/* Tasks */}
        {pr.taskCount > 0 && (
          <span style={{ color: "var(--color-status-warning)", opacity: 0.6 }}>
            {pr.taskCount} open task{pr.taskCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Build statuses */}
      {pr.buildStatuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {pr.buildStatuses.map((b, i) => (
            <a
              key={`${b.name}-${i}`}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-overlay-subtle px-2 py-1 text-label text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-tertiary"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              <BuildStateIcon state={b.state} size={12} />
              {b.name}
              <ExternalLink size={9} strokeWidth={1.5} className="text-text-muted" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DeploymentsTable({ deployments }: { deployments: DevDeployment[] }) {
  if (deployments.length === 0) return null;

  // Group by environment type
  const grouped: Record<string, DevDeployment[]> = {};
  for (const d of deployments) {
    const key = d.environmentType;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }

  const typeOrder = ["Production", "Staging", "Test"];
  const sortedTypes = typeOrder.filter((t) => grouped[t]);

  return (
    <div className="space-y-4">
      {sortedTypes.map((type) => (
        <div key={type}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">{type}</h4>
          <div className="overflow-hidden rounded-lg border border-border-default">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-overlay-subtle">
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Pipeline</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Environment</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {grouped[type].map((d, i) => (
                  <tr key={`${d.environment}-${i}`} className="hover:bg-overlay-subtle" style={{ transition: "background-color 0.15s ease" }}>
                    <td className="px-3 py-2">
                      <a
                        href={d.pipelineUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-tertiary cursor-pointer hover:text-[var(--color-brand-400)]"
                        style={{ transition: "color 0.15s ease" }}
                      >
                        {d.pipelineName}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-text-tertiary">{d.environment}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <BuildStateIcon state={d.state} size={12} />
                        <span className="text-text-tertiary">{d.state === "SUCCESSFUL" ? "Successful" : d.state === "FAILED" ? "Failed" : "In progress"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{d.completedAt ? shortDate(d.completedAt) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function BranchRow({ branch }: { branch: DevBranch }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        <GitBranch size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <a
          href={branch.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs font-medium text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)]"
          style={{ transition: "color 0.15s ease" }}
        >
          {branch.name}
        </a>
      </div>
      {branch.lastCommit && (
        <span className="shrink-0 pl-3 text-label text-text-muted">
          {branch.lastCommit.author} · {relativeDate(branch.lastCommit.date)}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <GitCommit size={32} strokeWidth={1} className="text-text-muted" />
      <p className="mt-3 text-sm text-text-muted">No development activity linked to this ticket</p>
      <p className="mt-1 text-xs text-text-muted">Branches, pull requests, and deployments will appear here when linked via the ticket key.</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 py-8">
      {[0.8, 0.6, 0.7].map((w, i) => (
        <div key={i} className="h-20 rounded-lg bg-overlay-subtle" style={{ width: `${w * 100}%`, animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

function PipelineRunsSection({ ticketKey, deploymentUrls }: { ticketKey: string; deploymentUrls: Set<string> }) {
  const { runs } = usePipelines({ ticketKey, limit: 10 });

  // Deduplicate: filter out runs that already appear in the Deployments table
  const filteredRuns = runs.filter((run) => !run.isDeployment || !deploymentUrls.has(run.pipelineUrl));
  if (filteredRuns.length === 0) return null;

  return (
    <section>
      <SectionHeader
        icon={<Activity size={16} strokeWidth={1.5} />}
        title="Pipeline History"
        count={filteredRuns.length}
      />
      <div className="divide-y divide-border-subtle rounded-lg border border-border-default bg-overlay-subtle">
        {filteredRuns.map((run) => (
          <div key={run.id} className="flex items-center gap-3 px-3 py-2.5">
            <BuildStateIcon state={run.state} size={13} />
            <span className="text-body-sm font-mono text-text-secondary">#{run.buildNumber}</span>
            <span className="text-label text-text-tertiary truncate flex-1">{run.branchName}</span>
            {run.environment && (
              <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-caption font-medium text-violet-400/80">
                {run.environment}
              </span>
            )}
            <span className="text-label text-text-muted tabular-nums">{run.completedAt ? relativeDate(run.completedAt) : "running"}</span>
            {run.pipelineUrl && (
              <a
                href={run.pipelineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-text-tertiary transition-colors duration-150 cursor-pointer"
              >
                <ExternalLink size={11} strokeWidth={1.5} />
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function TicketDevelopment({ ticketKey }: { ticketKey: string }) {
  const { data, isLoading } = useDevInfo(ticketKey);

  const hasData = data && (
    data.branches.length > 0 ||
    data.pullRequests.length > 0 ||
    data.commits.length > 0 ||
    data.builds.length > 0 ||
    data.deployments.length > 0
  );

  if (isLoading && !data) return <LoadingSkeleton />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-8 pt-2">
      {/* Pull Requests */}
      {data.pullRequests.length > 0 && (
        <section>
          <SectionHeader
            icon={<GitPullRequest size={16} strokeWidth={1.5} />}
            title="Pull Requests"
            count={data.pullRequests.length}
          />
          <div className="space-y-3">
            {data.pullRequests.map((pr) => (
              <PrCard key={`${pr.repo}-${pr.id}`} pr={pr} />
            ))}
          </div>
        </section>
      )}

      {/* Deployments */}
      {data.deployments.length > 0 && (
        <section>
          <SectionHeader
            icon={<Rocket size={16} strokeWidth={1.5} />}
            title="Deployments"
            count={data.deployments.length}
          />
          <DeploymentsTable deployments={data.deployments} />
        </section>
      )}

      {/* Pipeline History (from persistent store, deduplicated against deployments) */}
      <PipelineRunsSection
        ticketKey={ticketKey}
        deploymentUrls={new Set(data.deployments.map((d) => d.pipelineUrl))}
      />

      {/* Branches */}
      {data.branches.length > 0 && (
        <section>
          <SectionHeader
            icon={<GitBranch size={16} strokeWidth={1.5} />}
            title="Branches"
            count={data.branches.length}
          />
          <div className="divide-y divide-border-subtle rounded-lg border border-border-default bg-overlay-subtle px-3">
            {data.branches.map((b) => (
              <BranchRow key={b.name} branch={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
