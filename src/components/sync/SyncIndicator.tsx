"use client";

import { useState, useRef, useEffect } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, ChevronUp, Square } from "lucide-react";
import { useActivityContext, type ActivityState } from "@/contexts/ActivityContext";
import { useActivityStatus } from "@/hooks/useSprintBoard";
import type { ActivityLogEntry } from "@/types/ticket";

function stateIcon(state: ActivityState, errorCount: number) {
  if (state === "syncing") {
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
  return (
    <CheckCircle2
      className="h-3.5 w-3.5 text-[var(--color-brand-500)]/60"
      strokeWidth={2}
    />
  );
}

function stateLabel(state: ActivityState): string {
  if (state === "syncing") return "Syncing...";
  if (state === "error") return "Sync error";
  return "Synced";
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
    "webhook": "Webhook",
    "review": "Review",
    "metadata-update": "Metadata update",
    "local-edit": "Local edit",
    "push-to-jira": "Push to Jira",
    "bulk-action": "Bulk action",
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
  const { activityState, lastEntry, unacknowledgedErrors, runningEntries, cancelEntry, cancelAllEntries } = useActivityContext();
  const { data: recentEntries } = useActivityStatus(8);
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

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center ${collapsed ? "justify-center h-8 w-8" : "gap-2.5 px-3 py-2 w-full"} rounded-lg text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06] transition-colors duration-150`}
        aria-label="Activity status"
        title={collapsed ? stateLabel(activityState) : undefined}
      >
        <span className="relative shrink-0">
          {stateIcon(activityState, errorCount)}
          {errorCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black leading-none">
              {errorCount > 9 ? "9+" : errorCount}
            </span>
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-xs font-[var(--font-body)] truncate">
              {stateLabel(activityState)}
              {lastEntry?.completedAt && activityState === "idle" && (
                <span className="text-white/20 ml-1.5">{timeAgo(lastEntry.completedAt)}</span>
              )}
            </span>
            <ChevronUp
              className={`h-3 w-3 text-white/20 transition-transform duration-200 ${expanded ? "" : "rotate-180"}`}
              strokeWidth={1.5}
            />
          </>
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 rounded-lg border border-white/[0.06] bg-[var(--color-surface-floating)] shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)] overflow-hidden"
          style={{ width: collapsed ? "240px" : "100%", minWidth: "220px" }}
        >
          <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-white/30 font-[var(--font-body)]">
              Recent activity
            </span>
            {runningEntries.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cancelAllEntries(); }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400/80 cursor-pointer hover:bg-red-400/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400 active:scale-95 transition-colors duration-150 font-[var(--font-body)]"
              >
                <Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />
                Stop all
              </button>
            )}
          </div>
          <ul className="max-h-[240px] overflow-y-auto">
            {(!recentEntries || recentEntries.length === 0) && (
              <li className="px-3 py-3 text-xs text-white/25 font-[var(--font-body)]">
                No activity yet
              </li>
            )}
            {recentEntries?.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="px-3 py-2 flex items-start gap-2.5 hover:bg-white/[0.02] transition-colors duration-100"
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(entry.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-white/60 font-[var(--font-body)] truncate">
                      {entryTypeLabel(entry.type)}
                    </span>
                    <span className="text-[10px] text-white/20 shrink-0 font-[var(--font-body)]">
                      {timeAgo(entry.completedAt ?? entry.startedAt)}
                    </span>
                  </div>
                  {entry.summary && (
                    <div className="text-[11px] text-white/30 truncate font-[var(--font-body)] mt-0.5">
                      {entry.summary}
                    </div>
                  )}
                  {entry.status === "failed" && entry.errorDetail && (
                    <div className="text-[11px] text-amber-400/70 truncate font-[var(--font-body)] mt-0.5">
                      {entry.errorDetail}
                    </div>
                  )}
                  {entry.status === "running" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); cancelEntry(entry.id); }}
                      className="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400/70 cursor-pointer hover:bg-red-400/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400 active:scale-95 transition-colors duration-150 font-[var(--font-body)]"
                    >
                      <Square className="h-2 w-2" strokeWidth={2} fill="currentColor" />
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <a
            href="/activity-log"
            className="block px-3 py-2 text-[11px] text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] font-[var(--font-body)] border-t border-white/[0.06] transition-colors duration-150 cursor-pointer"
          >
            View full activity log
          </a>
        </div>
      )}
    </div>
  );
}
