"use client";

import { useState } from "react";
import {
  ChevronDown,
  GitBranch,
  GitPullRequest,
  GitCommit,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  MessageSquare,
  FileCode2,
  OctagonX,
  Maximize2,
} from "lucide-react";
import type {
  DevInfoPayload,
  DevBranch,
  DevPullRequest,
  DevCommit,
  DevBuild,
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

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "...";
}

const PR_STATUS_STYLES: Record<DevPullRequest["status"], { bg: string; text: string }> = {
  OPEN: { bg: "rgba(234,135,68,0.15)", text: "#ea8744" },
  MERGED: { bg: "rgba(74,170,96,0.15)", text: "#4aaa60" },
  DECLINED: { bg: "rgba(229,83,75,0.10)", text: "#e5534b80" },
};

function BuildStateIcon({ state }: { state: DevBuild["state"] }) {
  if (state === "SUCCESSFUL") return <CheckCircle2 size={11} strokeWidth={1.5} className="text-[#4aaa60]" />;
  if (state === "FAILED") return <XCircle size={11} strokeWidth={1.5} className="text-[#e5534b]" />;
  if (state === "STOPPED") return <OctagonX size={11} strokeWidth={1.5} className="text-text-muted" />;
  return <Loader2 size={11} strokeWidth={1.5} className="animate-spin text-[#ea8744]" />;
}

function BranchItem({ branch }: { branch: DevBranch }) {
  return (
    <div className="group/item flex items-start gap-2 py-1.5">
      <GitBranch size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <a
            href={branch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "color 0.15s ease" }}
          >
            {branch.name}
          </a>
          <ExternalLink
            size={10}
            strokeWidth={1.5}
            className="shrink-0 text-text-muted opacity-0 group-hover/item:opacity-100"
            style={{ transition: "opacity 0.15s ease" }}
          />
        </div>
        {branch.lastCommit && (
          <p className="mt-0.5 truncate text-label text-text-muted">
            {truncate(branch.lastCommit.message, 60)}
            <span className="ml-1.5 text-text-muted">{relativeDate(branch.lastCommit.date)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function PullRequestCard({ pr }: { pr: DevPullRequest }) {
  const style = PR_STATUS_STYLES[pr.status];
  const approvedCount = pr.reviewers.filter((r) => r.approved).length;
  const totalReviewers = pr.reviewers.length;

  return (
    <div className="rounded-lg border border-border-subtle bg-overlay-subtle p-3">
      {/* Header: title + status */}
      <div className="flex items-start gap-2">
        <GitPullRequest size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-xs font-medium text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease" }}
            >
              {pr.title}
            </a>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-caption font-semibold uppercase tracking-wider"
              style={{ backgroundColor: style.bg, color: style.text }}
            >
              {pr.status}
            </span>
          </div>
          {/* Meta line: author, repo, age */}
          <p className="mt-1 text-label text-text-muted">
            {pr.author}
            <span className="text-text-muted"> in </span>
            <span className="text-text-muted">{pr.repo}</span>
            {pr.createdAt && (
              <>
                <span className="text-text-muted"> · </span>
                <span className="text-text-muted">{relativeDate(pr.createdAt)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-text-muted">
        {/* Reviewers / approvals */}
        {totalReviewers > 0 && (
          <span className="flex items-center gap-1" title={pr.reviewers.map((r) => `${r.name}${r.approved ? " (approved)" : ""}`).join(", ")}>
            {approvedCount === totalReviewers ? (
              <CheckCircle2 size={11} strokeWidth={1.5} className="text-[#4aaa60]" />
            ) : approvedCount > 0 ? (
              <Circle size={11} strokeWidth={1.5} className="text-[#ea8744]" />
            ) : (
              <Circle size={11} strokeWidth={1.5} className="text-text-muted" />
            )}
            <span>{approvedCount}/{totalReviewers}</span>
          </span>
        )}

        {/* Diff stats */}
        {pr.diffStats && (
          <span className="flex items-center gap-1" title={`${pr.diffStats.filesChanged} files changed`}>
            <FileCode2 size={11} strokeWidth={1.5} className="text-text-muted" />
            <span className="text-[#4aaa60]/70">+{pr.diffStats.linesAdded}</span>
            <span className="text-[#e5534b]/60">-{pr.diffStats.linesRemoved}</span>
            <span className="text-text-muted">{pr.diffStats.filesChanged}f</span>
          </span>
        )}

        {/* Comments */}
        {pr.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={11} strokeWidth={1.5} className="text-text-muted" />
            {pr.commentCount}
          </span>
        )}

        {/* Tasks */}
        {pr.taskCount > 0 && (
          <span className="text-[#ea8744]/60">
            {pr.taskCount} task{pr.taskCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Build statuses */}
      {pr.buildStatuses.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {pr.buildStatuses.map((b, i) => (
            <a
              key={`${b.name}-${i}`}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-label text-text-muted cursor-pointer hover:text-text-tertiary"
              style={{ transition: "color 0.15s ease" }}
              title={`${b.name}: ${b.state}`}
            >
              <BuildStateIcon state={b.state} />
              <span className="max-w-[120px] truncate">{b.name}</span>
            </a>
          ))}
        </div>
      )}

      {/* Branch flow */}
      {pr.sourceBranch && pr.destBranch && (
        <p className="mt-2 truncate text-caption font-mono text-text-muted">
          {pr.sourceBranch} <span className="text-text-muted">-&gt;</span> {pr.destBranch}
        </p>
      )}
    </div>
  );
}

function CommitSummary({ commits }: { commits: DevCommit[] }) {
  if (commits.length === 0) return null;
  const latest = commits[0];
  return (
    <div className="flex items-start gap-2 py-1.5">
      <GitCommit size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {latest.url ? (
            <a
              href={latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease" }}
            >
              {truncate(latest.message, 80)}
            </a>
          ) : (
            <span className="truncate text-xs text-text-secondary">{truncate(latest.message, 80)}</span>
          )}
        </div>
        <p className="mt-0.5 text-label text-text-muted">
          {latest.author}
          <span className="ml-1.5 text-text-muted">{relativeDate(latest.date)}</span>
          {commits.length > 1 && (
            <span className="text-text-muted">
              {" "}· {commits.length - 1} more
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function BuildItem({ build }: { build: DevBuild }) {
  return (
    <div className="group/item flex items-center gap-2 py-1.5">
      <BuildStateIcon state={build.state} />
      <a
        href={build.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate text-xs text-text-secondary cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "color 0.15s ease" }}
      >
        {build.name}
      </a>
      {build.completedAt && (
        <span className="shrink-0 text-label text-text-muted">{relativeDate(build.completedAt)}</span>
      )}
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="h-3 rounded bg-overlay-subtle"
      style={{ width, animation: "pulse 1.5s ease-in-out infinite" }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <SkeletonLine width="75%" />
      <SkeletonLine width="60%" />
      <SkeletonLine width="45%" />
    </div>
  );
}

export function DevPanel({
  data,
  isLoading,
  onExpand,
}: {
  data: DevInfoPayload | null | undefined;
  isLoading: boolean;
  onExpand?: () => void;
}) {
  const hasData = data && (
    data.branches.length > 0 ||
    data.pullRequests.length > 0 ||
    data.commits.length > 0 ||
    data.builds.length > 0 ||
    (data.deployments?.length ?? 0) > 0
  );
  const [expanded, setExpanded] = useState<boolean | null>(null);

  const isExpanded = expanded ?? Boolean(hasData);

  const counts: string[] = [];
  if (data?.branches.length) counts.push(`${data.branches.length} branch${data.branches.length > 1 ? "es" : ""}`);
  if (data?.pullRequests.length) counts.push(`${data.pullRequests.length} PR${data.pullRequests.length > 1 ? "s" : ""}`);
  if (data?.commits.length) counts.push(`${data.commits.length} commit${data.commits.length > 1 ? "s" : ""}`);
  if (data?.builds.length) counts.push(`${data.builds.length} build${data.builds.length > 1 ? "s" : ""}`);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <div className="flex items-center gap-1.5">
          <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">
            Development
          </h3>
          <span className="text-caption text-text-muted">
            {counts.length > 0 ? counts.join(" \u00B7 ") : "(0)"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasData && onExpand && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExpand(); }}
              className="rounded p-0.5 text-text-muted cursor-pointer hover:text-text-tertiary hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
              title="Open in full view"
            >
              <Maximize2 size={11} strokeWidth={1.5} />
            </button>
          )}
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={`shrink-0 text-text-muted ${isExpanded ? "" : "-rotate-90"}`}
            style={{ transition: "transform 0.2s ease" }}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2">
          {isLoading && !data && <LoadingSkeleton />}

          {!isLoading && !hasData && (
            <p className="py-2 text-xs text-text-muted">
              No development activity linked to this ticket
            </p>
          )}

          {hasData && (
            <div className="space-y-2">
              {/* Branches */}
              {data.branches.length > 0 && (
                <div className="divide-y divide-border-subtle">
                  {data.branches.map((b) => (
                    <BranchItem key={b.name} branch={b} />
                  ))}
                </div>
              )}

              {/* Pull Requests as cards */}
              {data.pullRequests.length > 0 && (
                <div className="space-y-2">
                  {data.pullRequests.map((pr) => (
                    <PullRequestCard key={`${pr.repo}-${pr.id}`} pr={pr} />
                  ))}
                </div>
              )}

              {/* Commits */}
              {data.commits.length > 0 && (
                <div className="divide-y divide-border-subtle">
                  <CommitSummary commits={data.commits} />
                </div>
              )}

              {/* Standalone builds (from pipelines) */}
              {data.builds.length > 0 && (
                <div className="divide-y divide-border-subtle">
                  {data.builds.map((b, i) => (
                    <BuildItem key={`${b.name}-${i}`} build={b} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
