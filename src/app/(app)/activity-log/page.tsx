"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useActivityContext } from "@/contexts/ActivityContext";
import Link from "next/link";
import useSWR from "swr";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  ChevronDown,
  Square,
  Ban,
  Activity,
  ChevronRight,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  RepeatIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Tooltip } from "@/components/shared/Tooltip";
import type {
  ActivityLogEntry,
  ActivityLogStatsResponse,
  ActivityLogStats,
  ActivityLogDayStats,
  RecurringFailure,
  ActivityLogTimelineEntry,
  HealthScore,
} from "@/types/ticket";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));
const statsFetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null));

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "sprint-sync", label: "Sprint sync" },
  { value: "ticket-sync", label: "Ticket sync" },
  { value: "single-ticket", label: "Single ticket" },
  { value: "comment-sync", label: "Comment sync" },
  { value: "review", label: "Review" },
  { value: "metadata-update", label: "Metadata update" },
  { value: "local-edit", label: "Local edit" },
  { value: "push-to-jira", label: "Push to Jira" },
  { value: "bulk-action", label: "Bulk action" },
  { value: "story-writer", label: "Story writer" },
  { value: "incremental-sync", label: "Incremental sync" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 30;

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

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return time;

  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${day} ${time}`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Parse errorDetail if it's JSON from agent-fetch; otherwise return as plain string. */
function parseErrorDetail(raw: string | null): { display: string; structured: Record<string, unknown> | null } {
  if (!raw) return { display: "", structured: null };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const parts: string[] = [];
      if (typeof parsed.code === "string") parts.push(parsed.code);
      if (typeof parsed.error === "string" && parsed.error !== parsed.code) parts.push(parsed.error);
      if (typeof parsed.httpStatus === "number" && parsed.httpStatus > 0) parts.push(`HTTP ${parsed.httpStatus}`);
      if (typeof parsed.retryCount === "number" && parsed.retryCount > 0) parts.push(`${parsed.retryCount} retr${parsed.retryCount === 1 ? "y" : "ies"}`);
      return { display: parts.join(" · ") || raw, structured: parsed as Record<string, unknown> };
    }
  } catch { /* not JSON */ }
  return { display: raw, structured: null };
}

function StatusIcon({ status }: { status: ActivityLogEntry["status"] }) {
  if (status === "success") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />;
  }
  if (status === "cancelled") {
    return <Ban className="h-3.5 w-3.5 text-white/30" strokeWidth={2} />;
  }
  return <RefreshCw className="h-3.5 w-3.5 text-white/30 animate-spin" strokeWidth={2} />;
}

function statusLabel(status: ActivityLogEntry["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Running";
}

// --- Phase 4: Health Score Badge ---

function HealthScoreBadge({ healthScore }: { healthScore: HealthScore }) {
  const { score, band, trend, components } = healthScore;

  const bandColor =
    band === "green"
      ? { ring: "rgba(74,222,128,0.25)", text: "text-green-400", bg: "rgba(74,222,128,0.08)" }
      : band === "amber"
      ? { ring: "rgba(251,191,36,0.25)", text: "text-amber-400", bg: "rgba(251,191,36,0.08)" }
      : { ring: "rgba(248,113,113,0.25)", text: "text-red-400", bg: "rgba(248,113,113,0.08)" };

  const tooltipContent = `Health score ${score}/100 — Success rate: ${components.successRate} · Duration consistency: ${components.durationConsistency} · Error-free streak: ${components.errorFreeStreak}`;

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-400/70" : trend === "down" ? "text-red-400/70" : "text-white/25";

  return (
    <Tooltip content={tooltipContent}>
      <div
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-default select-none"
        style={{ background: bandColor.bg, boxShadow: `0 0 0 1px ${bandColor.ring}` }}
      >
        <span className={`text-sm font-bold tabular-nums font-[var(--font-display)] tracking-tight ${bandColor.text}`}>
          {score}
        </span>
        <span className="text-[10px] text-white/20 font-[var(--font-body)]">/100</span>
        <TrendIcon className={`h-3 w-3 ${trendColor}`} strokeWidth={2} />
      </div>
    </Tooltip>
  );
}

// --- Phase 1: Stats Bar ---

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
      <span className="flex items-center gap-0.5 text-[10px] text-white/20 font-[var(--font-body)]">
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
    <span className={`flex items-center gap-0.5 text-[10px] font-[var(--font-body)] ${color}`}>
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      <span>{sign}{format(diff)}</span>
    </span>
  );
}

function StatsBar({ today, yesterday }: { today: ActivityLogDayStats; yesterday: ActivityLogDayStats }) {
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
          className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
        >
          <span className="text-[10px] uppercase tracking-widest text-white/20 font-semibold font-[var(--font-body)]">
            {m.label}
          </span>
          <span className="text-xl font-bold tabular-nums font-[var(--font-display)] tracking-tight text-white/85">
            {m.value}
          </span>
          {m.delta}
        </div>
      ))}
    </div>
  );
}

// --- Phase 2: Recurring Failures ---

function RecurringFailures({
  failures,
  sprintMap,
  onJumpToEntry,
}: {
  failures: RecurringFailure[];
  sprintMap: Map<string, string>;
  onJumpToEntry: (id: string) => void;
}) {
  if (failures.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-white/[0.04] bg-[var(--color-surface-elevated)] px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <RepeatIcon className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/20 font-[var(--font-body)]">
            Recurring Failures
          </span>
        </div>
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand-400)]/50" strokeWidth={1.5} />
          <span className="text-xs text-white/25 font-[var(--font-body)]">
            No recurring failures in the last 7 days
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-400/[0.12] bg-[var(--color-surface-elevated)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] bg-amber-400/[0.03]">
        <RepeatIcon className="h-3.5 w-3.5 text-amber-400/60" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/60 font-[var(--font-body)]">
          Recurring Failures
        </span>
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400/15 px-1.5 text-[10px] font-bold text-amber-400 font-[var(--font-body)]">
          {failures.length}
        </span>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {failures.map((f) => (
          <button
            key={`${f.type}::${f.pattern}`}
            type="button"
            onClick={() => onJumpToEntry(f.mostRecentEntryId)}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.015] transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] text-left"
          >
            <div className="flex flex-col items-start gap-0.5 min-w-[110px] shrink-0">
              <span className="text-[11px] text-white/50 font-[var(--font-body)]">
                {entryTypeLabel(f.type)}
              </span>
              <span className="text-[10px] text-white/20 font-[var(--font-body)]">
                {formatRelativeTime(f.lastOccurrence)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-400/70 font-[var(--font-body)] truncate leading-relaxed">
                {f.pattern}
              </p>
              {f.affectedScopes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {f.affectedScopes.slice(0, 5).map((scope) => {
                    const sprintName = sprintMap.get(scope);
                    return (
                      <span
                        key={scope}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-white/[0.04] text-white/30 font-[var(--font-body)]"
                      >
                        {sprintName ?? scope}
                      </span>
                    );
                  })}
                  {f.affectedScopes.length > 5 && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-white/20 font-[var(--font-body)]">
                      +{f.affectedScopes.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <span className="text-sm font-bold tabular-nums font-[var(--font-display)] text-amber-400/80">
                {f.count}
              </span>
              <span className="text-[10px] text-white/20 font-[var(--font-body)]">occurrences</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Phase 3: Event Timeline ---

function EventTimeline({
  entries,
  onClickEntry,
}: {
  entries: ActivityLogTimelineEntry[];
  onClickEntry: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    entry: ActivityLogTimelineEntry;
  } | null>(null);

  const now = +new Date();
  const windowStart = now - 24 * 60 * 60 * 1000;

  const dotColor = (status: ActivityLogTimelineEntry["status"]) => {
    if (status === "success") return "#3389d8"; // brand-400
    if (status === "failed") return "#f87171"; // red-400
    return "#fbbf24"; // amber-400 for running/cancelled
  };

  const hourLabels = Array.from({ length: 7 }, (_, i) => {
    const ts = windowStart + (i * 4 * 60 * 60 * 1000);
    const pct = ((ts - windowStart) / (now - windowStart)) * 100;
    if (pct < 0 || pct > 100) return null;
    const h = new Date(ts).getHours();
    return { label: `${h.toString().padStart(2, "0")}:00`, pct };
  }).filter(Boolean) as { label: string; pct: number }[];

  return (
    <div className="mb-5 rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/20 font-[var(--font-body)]">
          Last 24 Hours
        </span>
        <span className="ml-auto text-[10px] text-white/15 font-[var(--font-body)]">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Timeline track */}
      <div
        ref={containerRef}
        className="relative h-6 rounded-full bg-white/[0.03] border border-white/[0.04] overflow-visible"
        style={{ marginBottom: "20px" }}
      >
        {/* Track fill */}
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.015))" }} />

        {/* Dots */}
        {entries.map((entry) => {
          const pct =
            ((new Date(entry.startedAt).getTime() - windowStart) / (now - windowStart)) * 100;
          if (pct < 0 || pct > 100) return null;
          const color = dotColor(entry.status);
          return (
            <button
              key={entry.id}
              type="button"
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 4px ${color}60`,
                cursor: "pointer",
                border: "none",
                padding: 0,
                outline: "none",
                zIndex: 1,
                transition: "transform 0.1s ease, box-shadow 0.1s ease",
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({ x: rect.left + rect.width / 2, y: rect.top, entry });
                (e.currentTarget as HTMLButtonElement).style.transform = "translate(-50%, -50%) scale(1.6)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 8px ${color}90`;
              }}
              onMouseLeave={(e) => {
                setTooltip(null);
                (e.currentTarget as HTMLButtonElement).style.transform = "translate(-50%, -50%)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 4px ${color}60`;
              }}
              onClick={() => onClickEntry(entry.id)}
              aria-label={`${entryTypeLabel(entry.type)} at ${formatTimestamp(entry.startedAt)}`}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            />
          );
        })}

        {/* Now indicator */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px bg-white/[0.08]"
          style={{ borderRight: "1px dashed rgba(255,255,255,0.08)" }}
        />
      </div>

      {/* Hour labels */}
      <div className="relative h-4" style={{ marginTop: "-16px" }}>
        {hourLabels.map(({ label, pct }) => (
          <span
            key={label}
            className="absolute text-[9px] text-white/15 font-[var(--font-body)] -translate-x-1/2"
            style={{ left: `${pct}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          style={{
            top: tooltip.y - 8,
            left: tooltip.x,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-[11px] font-semibold text-white/80 font-[var(--font-body)]">
            {entryTypeLabel(tooltip.entry.type)}
          </div>
          <div className="text-[10px] text-white/40 font-[var(--font-body)] mt-0.5 space-y-0.5">
            <div>{formatTimestamp(tooltip.entry.startedAt)}</div>
            {tooltip.entry.scope && <div>{tooltip.entry.scope}</div>}
            {tooltip.entry.durationMs && <div>{formatDuration(tooltip.entry.durationMs)}</div>}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-white/15 font-[var(--font-body)]">No events in the last 24 hours</span>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export default function ActivityLogPage() {
  const pageTitle = usePageTitle("Activity Log");
  const { acknowledgeAllErrors, mutateActivityLog } = useActivityContext();

  useEffect(() => {
    acknowledgeAllErrors();
  }, [acknowledgeAllErrors]);

  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (selectedTypes.size > 0) params.set("type", [...selectedTypes].join(","));
  if (statusFilter) params.set("status", statusFilter);

  const { data: sprints } = useSWR<Array<{ id: number; name: string }>>(
    "/api/jira/sprints",
    fetcher,
  );

  const sprintMap = useMemo(() => {
    const map = new Map<string, string>();
    if (sprints) {
      for (const s of sprints) {
        map.set(String(s.id), s.name);
      }
    }
    return map;
  }, [sprints]);

  const { data: entries, isLoading, mutate } = useSWR<ActivityLogEntry[]>(
    `/api/activity-log?${params.toString()}`,
    fetcher,
    { refreshInterval: 10000 },
  );

  const { data: statsResponse } = useSWR<ActivityLogStatsResponse>(
    "/api/activity-log?include=stats",
    statsFetcher,
    { refreshInterval: 30000 },
  );

  const stats: ActivityLogStats | undefined = statsResponse?.stats;

  const refresh = useCallback(() => {
    mutate();
    mutateActivityLog();
  }, [mutate, mutateActivityLog]);

  const cancelSync = useCallback(async (id: string) => {
    await fetch(`/api/activity-log/${id}/cancel`, { method: "POST" });
    mutate();
  }, [mutate]);

  const cancelAllSyncs = useCallback(async () => {
    await fetch("/api/activity-log/cancel-all", { method: "POST" });
    mutate();
  }, [mutate]);

  const acknowledgeEntry = useCallback(async (id: string) => {
    await fetch(`/api/activity-log/${id}/acknowledge`, { method: "POST" });
    mutate();
    mutateActivityLog();
  }, [mutate, mutateActivityLog]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setOffset(0);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setOffset(0);
  }, []);

  // Jump to a specific entry: clear filters, reset pagination, expand the target row
  const jumpToEntry = useCallback((id: string) => {
    setSelectedTypes(new Set());
    setStatusFilter("");
    setOffset(0);
    setExpandedIds(new Set([id]));
    setJumpTarget(id);
  }, []);

  // Scroll to row after data loads
  useEffect(() => {
    if (!jumpTarget || !entries) return;
    const found = entries.find((e) => e.id === jumpTarget);
    if (!found) return;
    const el = rowRefs.current.get(jumpTarget);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setJumpTarget(null), 0);
    }
  }, [jumpTarget, entries]);

  const hasMore = entries?.length === PAGE_SIZE;

  return (
    <>
      {pageTitle}
      <ViewHeader
        icon={<Activity size={16} strokeWidth={1.5} />}
        actions={stats?.healthScore ? <HealthScoreBadge healthScore={stats.healthScore} /> : undefined}
      >
        <ViewHeaderTitle>Activity Log</ViewHeaderTitle>
      </ViewHeader>
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* Phase 1: Stats bar */}
        {stats && (
          <StatsBar today={stats.today} yesterday={stats.yesterday} />
        )}

        {/* Phase 2: Recurring failures */}
        {stats && (
          <RecurringFailures
            failures={stats.recurringFailures}
            sprintMap={sprintMap}
            onJumpToEntry={jumpToEntry}
          />
        )}

        {/* Phase 3: Timeline */}
        {stats && (
          <EventTimeline entries={stats.timeline} onClickEntry={jumpToEntry} />
        )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Filter className="h-3.5 w-3.5 text-white/25" strokeWidth={2} />
          <SelectFilter
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={handleStatusChange}
          />
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-transparent px-2.5 py-1.5 text-xs text-white/40 cursor-pointer hover:border-white/[0.1] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={2} />
          </button>
          {entries?.some((e) => e.status === "running") && (
            <Button
              variant="destructive"
              size="sm"
              icon={<Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />}
              onClick={() => cancelAllSyncs()}
              className="ml-auto"
            >
              Stop all
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.filter((o) => o.value !== "").map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleType(opt.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-[var(--font-body)] cursor-pointer border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 ${
                selectedTypes.has(opt.value)
                  ? "border-[var(--color-brand-400)]/30 bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)]"
                  : "border-white/[0.06] bg-transparent text-white/35 hover:border-white/[0.1] hover:text-white/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {selectedTypes.size > 0 && (
            <button
              type="button"
              onClick={() => { setSelectedTypes(new Set()); setOffset(0); }}
              className="px-2.5 py-1 rounded-md text-[11px] font-[var(--font-body)] text-white/25 cursor-pointer hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-colors duration-150"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
        {/* Header row */}
        <div className="grid grid-cols-[20px_1fr_140px_100px_140px_130px] gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
          <span />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Type</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Status</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Duration</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Scope</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)] text-right">Time</span>
        </div>

        {/* Loading state */}
        {isLoading && !entries && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-4 w-4 text-white/20 animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* Empty state */}
        {entries?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Clock className="h-8 w-8 text-white/10" strokeWidth={1.5} />
            <span className="text-sm text-white/25 font-[var(--font-body)]">No activity entries found</span>
          </div>
        )}

        {/* Rows */}
        {entries?.map((entry, i) => {
          const isExpanded = expandedIds.has(entry.id);
          const { display: errorDisplay, structured } = parseErrorDetail(entry.errorDetail);
          const hasExpandableContent = !!(entry.summary || entry.errorDetail);

          return (
            <div key={entry.id} ref={(el) => { if (el) rowRefs.current.set(entry.id, el); else rowRefs.current.delete(entry.id); }}>
              <div
                className={`grid grid-cols-[20px_1fr_140px_100px_140px_130px] gap-3 px-4 py-3 items-start transition-colors duration-100 ${
                  i < (entries.length - 1) || isExpanded ? "border-b border-white/[0.03]" : ""
                } ${hasExpandableContent ? "hover:bg-white/[0.015] cursor-pointer" : ""}`}
                onClick={() => hasExpandableContent && toggleExpanded(entry.id)}
              >
                {/* Expand chevron */}
                <div className="flex items-center justify-center pt-0.5">
                  {hasExpandableContent && (
                    <ChevronRight
                      className={`h-3 w-3 text-white/20 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      strokeWidth={2}
                    />
                  )}
                </div>

                {/* Type + summary preview */}
                <div className="min-w-0">
                  <span className="text-xs text-white/70 font-[var(--font-body)]">
                    {entryTypeLabel(entry.type)}
                  </span>
                  {entry.summary && !isExpanded && (
                    <div className="text-[11px] text-white/30 truncate font-[var(--font-body)] mt-0.5">
                      {entry.summary}
                    </div>
                  )}
                  {entry.status === "failed" && entry.errorDetail && !isExpanded && (
                    <div className="text-[11px] text-amber-400/60 truncate font-[var(--font-body)] mt-0.5">
                      {errorDisplay}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <StatusIcon status={entry.status} />
                  <span className={`text-xs font-[var(--font-body)] ${
                    entry.status === "success" ? "text-[var(--color-brand-400)]/70" :
                    entry.status === "failed" ? "text-amber-400/70" :
                    entry.status === "cancelled" ? "text-white/30" :
                    "text-white/30"
                  }`}>
                    {statusLabel(entry.status)}
                  </span>
                  {entry.status === "running" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      icon={<Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />}
                      onClick={() => cancelSync(entry.id)}
                      title="Cancel this sync"
                      className="ml-1"
                    >
                      Cancel
                    </Button>
                  )}
                  {entry.status === "failed" && !entry.acknowledged && (
                    <button
                      type="button"
                      title="Dismiss"
                      onClick={() => acknowledgeEntry(entry.id)}
                      className="ml-1 flex items-center justify-center h-4 w-4 rounded text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                {/* Duration */}
                <span className="text-xs text-white/30 font-[var(--font-body)] tabular-nums">
                  {formatDuration(entry.durationMs)}
                </span>

                {/* Scope */}
                <div onClick={(e) => e.stopPropagation()}>
                  <ScopeCell scope={entry.scope} type={entry.type} sprintMap={sprintMap} />
                </div>

                {/* Timestamp */}
                <span className="text-xs text-white/25 font-[var(--font-body)] tabular-nums text-right">
                  {formatTimestamp(entry.startedAt)}
                </span>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className={`px-10 py-3 bg-white/[0.008] ${i < (entries.length - 1) ? "border-b border-white/[0.03]" : ""}`}>
                  {entry.summary && (
                    <div className="mb-2">
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-white/20 font-[var(--font-body)]">Summary</span>
                      <p className="mt-1 text-xs text-white/50 font-[var(--font-body)] leading-relaxed">{entry.summary}</p>
                    </div>
                  )}
                  {entry.errorDetail && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-white/20 font-[var(--font-body)]">Error detail</span>
                      {structured ? (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(structured).map(([k, v]) => (
                            <span key={k} className="text-[11px] font-[var(--font-body)]">
                              <span className="text-white/25">{k}: </span>
                              <span className="text-amber-400/70">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-amber-400/60 font-[var(--font-body)] leading-relaxed break-all">{entry.errorDetail}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className="text-[11px] text-white/20 font-[var(--font-body)]">
          Showing {offset + 1} - {offset + (entries?.length ?? 0)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={!hasMore}
        >
          Next
        </Button>
      </div>
    </div>
    </>
  );
}

function ScopeCell({
  scope,
  type,
  sprintMap,
}: {
  scope: string | null;
  type: ActivityLogEntry["type"];
  sprintMap: Map<string, string>;
}) {
  if (!scope || scope === "0") {
    return <span className="text-xs text-white/25 font-[var(--font-body)] truncate">-</span>;
  }

  // Ticket keys: comma-separated VPL-XXXXX patterns
  const ticketKeyPattern = /^[A-Z]+-\d+(,[A-Z]+-\d+)*$/;
  if (ticketKeyPattern.test(scope)) {
    const keys = scope.split(",");
    return (
      <div className="flex flex-wrap gap-1 min-w-0">
        {keys.map((key) => (
          <Link
            key={key}
            href={`/tickets/${key}`}
            className="text-xs font-[var(--font-body)] cursor-pointer transition-colors duration-150"
            style={{ color: "var(--color-brand-400)" }}
          >
            {key}
          </Link>
        ))}
      </div>
    );
  }

  // Sprint ID: numeric scope with a known sprint name
  const sprintName = sprintMap.get(scope);
  if (sprintName && (type === "sprint-sync" || type === "ticket-sync")) {
    return (
      <Link
        href={`/sprint-board?sprint=${scope}`}
        className="text-xs font-[var(--font-body)] truncate cursor-pointer transition-colors duration-150"
        style={{ color: "var(--color-brand-400)" }}
        title={sprintName}
      >
        {sprintName}
      </Link>
    );
  }

  // Fallback: plain text (e.g. "sprints", "history")
  return <span className="text-xs text-white/25 font-[var(--font-body)] truncate">{scope}</span>;
}

function SelectFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="appearance-none rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] px-3 py-1.5 pr-7 text-xs text-white/60 font-[var(--font-body)] cursor-pointer hover:border-white/[0.1] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20 pointer-events-none" strokeWidth={2} />
    </div>
  );
}
