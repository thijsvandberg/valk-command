"use client";

import { useState, useRef, useEffect } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, ChevronUp, Square, CloudDownload, CheckCheck } from "lucide-react";
import { useActivityContext, type ActivityState } from "@/contexts/ActivityContext";
import type { ActivityLogEntry } from "@/types/ticket";
import { Button } from "@/components/ui/Button";

function stateIcon(state: ActivityState, errorCount: number, syncRemaining: number, hasChecked: boolean) {
  if (!hasChecked || state === "syncing") {
    return (
      <RefreshCw
        className="h-3.5 w-3.5 text-[var(--color-brand-400)] animate-spin"
        strokeWidth={2}
      />
    );
  }
  if (state === "error" || errorCount > 0) {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-amber-400"
        strokeWidth={2}
      />
    );
  }
  if (syncRemaining > 0) {
    return (
      <CloudDownload
        className="h-3.5 w-3.5 text-[var(--color-brand-400)]"
        strokeWidth={2}
      />
    );
  }
  return (
    <CheckCircle2
      className="h-3.5 w-3.5 text-[var(--color-brand-500)]/60"
      strokeWidth={2}
    />
  );
}

function stateLabel(state: ActivityState, syncRemaining: number, hasChecked: boolean): string {
  if (!hasChecked) return "Checking...";
  if (state === "syncing") return "Active...";
  if (state === "error") return "Error";
  if (syncRemaining > 0) return `Catching up (${syncRemaining})`;
  return "All clear";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function entryTypeLabel(type: ActivityLogEntry["type"]): string {
  const labels: Record<ActivityLogEntry["type"], string> = {
    "sprint-sync": "Sprint sync",
    "ticket-sync": "Ticket sync",
    "single-ticket": "Single ticket",
    "comment-sync": "Comment sync",
    "review": "Review",
    "metadata-update": "Metadata update",
    "local-edit": "Local edit",
    "push-to-jira": "Push to Jira",
    "bulk-action": "Bulk action",
    "story-writer": "Story writer",
    "incremental-sync": "Incremental sync",
  };
  return labels[type] ?? type;
}

function statusDot(status: ActivityLogEntry["status"]) {
  if (status === "success") return "bg-[var(--color-brand-500)]";
  if (status === "failed") return "bg-amber-400";
  if (status === "cancelled") return "bg-white/30";
  return "bg-white/20";
}

export function SyncIndicator({ collapsed }: { collapsed: boolean }) {
  const { activityState, lastEntry, unacknowledgedErrors, runningEntries, logEntries, incrementalSyncRemaining, incrementalSyncLastAt, incrementalSyncLastCount, cancelEntry, cancelAllEntries } = useActivityContext();
  const recentEntries = logEntries.slice(0, 8);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const errorCount = unacknowledgedErrors.length;
  const hasChecked = incrementalSyncLastAt !== null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center ${collapsed ? "justify-center h-8 w-8" : "gap-2.5 px-3 py-2 w-full"} rounded-lg text-text-tertiary cursor-pointer hover:bg-hover-list-item hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-default transition-colors duration-150`}
        aria-label="Activity status"
        title={collapsed ? stateLabel(activityState, incrementalSyncRemaining, hasChecked) : undefined}
      >
        <span className="relative shrink-0">
          {stateIcon(activityState, errorCount, incrementalSyncRemaining, hasChecked)}
          {errorCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-caption font-bold text-black leading-none">
              {errorCount > 9 ? "9+" : errorCount}
            </span>
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-xs font-[var(--font-body)] truncate">
              {stateLabel(activityState, incrementalSyncRemaining, hasChecked)}
              {lastEntry?.completedAt && activityState === "idle" && incrementalSyncRemaining === 0 && hasChecked && (
                <span className="text-text-muted ml-1.5">{timeAgo(lastEntry.completedAt)}</span>
              )}
            </span>
            <ChevronUp
              className={`h-3 w-3 text-text-muted transition-transform duration-200 ${expanded ? "" : "rotate-180"}`}
              strokeWidth={1.5}
            />
          </>
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 rounded-lg border border-border-default bg-[var(--color-surface-floating)] shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_var(--color-overlay-subtle)] overflow-hidden"
          style={{ width: collapsed ? "240px" : "100%", minWidth: "220px" }}
        >
          <div className="px-3 py-2.5 border-b border-border-default flex items-center justify-between">
            <span className="text-label font-semibold tracking-wide uppercase text-text-tertiary font-[var(--font-body)]">
              Recent activity
            </span>
            {runningEntries.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                icon={<Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />}
                onClick={(e) => { e.stopPropagation(); cancelAllEntries(); }}
                className="font-[var(--font-body)]"
              >
                Stop all
              </Button>
            )}
          </div>
          <div className="px-3 py-2 flex items-center gap-2 border-b border-border-default">
            {!incrementalSyncLastAt ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-text-muted animate-spin shrink-0" strokeWidth={2} />
                <span className="text-label text-text-tertiary font-[var(--font-body)]">
                  Checking Jira...
                </span>
              </>
            ) : incrementalSyncRemaining > 0 ? (
              <>
                <CloudDownload className="h-3.5 w-3.5 text-[var(--color-brand-400)] shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <span className="text-label text-[var(--color-brand-300)] font-[var(--font-body)]">
                    {incrementalSyncRemaining} ticket{incrementalSyncRemaining === 1 ? "" : "s"} still catching up
                  </span>
                  <div className="text-caption text-text-muted font-[var(--font-body)] mt-0.5">
                    Last sync {timeAgo(incrementalSyncLastAt)}{incrementalSyncLastCount > 0 ? ` \u00b7 ${incrementalSyncLastCount} updated` : ""}
                  </div>
                </div>
              </>
            ) : (
              <>
                <CheckCheck className="h-3.5 w-3.5 text-[var(--color-brand-500)]/60 shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <span className="text-label text-text-tertiary font-[var(--font-body)]">
                    Jira sync up to date
                  </span>
                  <div className="text-caption text-text-muted font-[var(--font-body)] mt-0.5">
                    Last check {timeAgo(incrementalSyncLastAt)}{incrementalSyncLastCount > 0 ? ` \u00b7 ${incrementalSyncLastCount} updated` : ""}
                  </div>
                </div>
              </>
            )}
          </div>
          <ul className="max-h-[240px] overflow-y-auto">
            {(!recentEntries || recentEntries.length === 0) && (
              <li className="px-3 py-3 text-xs text-text-muted font-[var(--font-body)]">
                No activity yet
              </li>
            )}
            {recentEntries?.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="px-3 py-2 flex items-start gap-2.5 hover:bg-overlay-subtle transition-colors duration-100"
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(entry.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-text-secondary font-[var(--font-body)] truncate">
                      {entryTypeLabel(entry.type)}
                      {entry.sprintName && (
                        <span className="text-text-tertiary ml-1">&middot; {entry.sprintName}</span>
                      )}
                    </span>
                    <span className="text-caption text-text-muted shrink-0 font-[var(--font-body)]">
                      {timeAgo(entry.completedAt ?? entry.startedAt)}
                    </span>
                  </div>
                  {entry.summary && (
                    <div className="text-label text-text-tertiary truncate font-[var(--font-body)] mt-0.5">
                      {entry.summary}
                    </div>
                  )}
                  {entry.status === "failed" && entry.errorDetail && (
                    <div className="text-label text-amber-400/70 truncate font-[var(--font-body)] mt-0.5">
                      {entry.errorDetail}
                    </div>
                  )}
                  {entry.status === "running" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      icon={<Square className="h-2 w-2" strokeWidth={2} fill="currentColor" />}
                      onClick={(e) => { e.stopPropagation(); cancelEntry(entry.id); }}
                      className="mt-1 font-[var(--font-body)]"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <a
            href="/activity-log"
            className="block px-3 py-2 text-label text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] font-[var(--font-body)] border-t border-border-default transition-colors duration-150 cursor-pointer"
          >
            View full activity log
          </a>
        </div>
      )}
    </div>
  );
}
