"use client";

import { useState } from "react";
import {
  ChevronDown,
  GitBranch,
  GitPullRequest,
  GitCommit,
  Hammer,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
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

function BranchItem({ branch }: { branch: DevBranch }) {
  return (
    <div className="group/item flex items-start gap-2 py-1.5">
      <GitBranch size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-white/20" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <a
            href={branch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium text-white/55 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "color 0.15s ease" }}
          >
            {branch.name}
          </a>
          <ExternalLink
            size={10}
            strokeWidth={1.5}
            className="shrink-0 text-white/15 opacity-0 group-hover/item:opacity-100"
            style={{ transition: "opacity 0.15s ease" }}
          />
        </div>
        {branch.lastCommit && (
          <p className="mt-0.5 truncate text-[11px] text-white/25">
            {truncate(branch.lastCommit.message, 60)}
            <span className="ml-1.5 text-white/15">{relativeDate(branch.lastCommit.date)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function PullRequestItem({ pr }: { pr: DevPullRequest }) {
  const style = PR_STATUS_STYLES[pr.status];
  return (
    <div className="group/item flex items-start gap-2 py-1.5">
      <GitPullRequest size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-white/20" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-xs font-medium text-white/55 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "color 0.15s ease" }}
          >
            {pr.title}
          </a>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {pr.status}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-white/25">
          {pr.author}
          {pr.reviewers.length > 0 && (
            <span className="text-white/15">
              {" "}· {pr.reviewers.length} reviewer{pr.reviewers.length > 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function CommitSummary({ commits }: { commits: DevCommit[] }) {
  if (commits.length === 0) return null;
  const latest = commits[0];
  return (
    <div className="flex items-start gap-2 py-1.5">
      <GitCommit size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-white/20" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {latest.url ? (
            <a
              href={latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-white/55 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease" }}
            >
              {truncate(latest.message, 80)}
            </a>
          ) : (
            <span className="truncate text-xs text-white/55">{truncate(latest.message, 80)}</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-white/25">
          {latest.author}
          <span className="ml-1.5 text-white/15">{relativeDate(latest.date)}</span>
          {commits.length > 1 && (
            <span className="text-white/15">
              {" "}· {commits.length - 1} more
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function BuildItem({ build }: { build: DevBuild }) {
  const stateIcon = build.state === "SUCCESSFUL"
    ? <CheckCircle2 size={12} strokeWidth={1.5} className="text-[#4aaa60]" />
    : build.state === "FAILED"
    ? <XCircle size={12} strokeWidth={1.5} className="text-[#e5534b]" />
    : <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-[#ea8744]" />;

  return (
    <div className="group/item flex items-center gap-2 py-1.5">
      {stateIcon}
      <a
        href={build.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate text-xs text-white/55 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "color 0.15s ease" }}
      >
        {build.name}
      </a>
      {build.completedAt && (
        <span className="shrink-0 text-[11px] text-white/15">{relativeDate(build.completedAt)}</span>
      )}
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="h-3 rounded bg-white/[0.04]"
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
}: {
  data: DevInfoPayload | null | undefined;
  isLoading: boolean;
}) {
  const hasData = data && (
    data.branches.length > 0 ||
    data.pullRequests.length > 0 ||
    data.commits.length > 0 ||
    data.builds.length > 0
  );
  const [expanded, setExpanded] = useState<boolean | null>(null);

  // Auto-expand when data arrives, auto-collapse when empty
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
        className="flex w-full items-center justify-between cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">
            Development
          </h3>
          {counts.length > 0 && (
            <span className="text-[10px] text-white/15">
              {counts.join(" \u00B7 ")}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`shrink-0 text-white/20 ${isExpanded ? "" : "-rotate-90"}`}
          style={{ transition: "transform 0.2s ease" }}
        />
      </button>

      {isExpanded && (
        <div className="mt-2">
          {isLoading && !data && <LoadingSkeleton />}

          {!isLoading && !hasData && (
            <p className="py-2 text-xs text-white/20">
              No development activity linked to this ticket
            </p>
          )}

          {hasData && (
            <div className="divide-y divide-white/[0.04]">
              {data.branches.length > 0 && (
                <div className="py-1">
                  {data.branches.map((b) => (
                    <BranchItem key={b.name} branch={b} />
                  ))}
                </div>
              )}
              {data.pullRequests.length > 0 && (
                <div className="py-1">
                  {data.pullRequests.map((pr) => (
                    <PullRequestItem key={pr.id} pr={pr} />
                  ))}
                </div>
              )}
              {data.commits.length > 0 && (
                <div className="py-1">
                  <CommitSummary commits={data.commits} />
                </div>
              )}
              {data.builds.length > 0 && (
                <div className="py-1">
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
