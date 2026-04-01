"use client";

import { useState, useCallback, useMemo } from "react";
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
} from "lucide-react";
import type { SyncLogEntry } from "@/types/ticket";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "sprint-sync", label: "Sprint sync" },
  { value: "ticket-sync", label: "Ticket sync" },
  { value: "single-ticket", label: "Single ticket" },
  { value: "comment-sync", label: "Comment sync" },
  { value: "webhook", label: "Webhook" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 30;

function entryTypeLabel(type: SyncLogEntry["type"]): string {
  const labels: Record<SyncLogEntry["type"], string> = {
    "sprint-sync": "Sprint sync",
    "ticket-sync": "Ticket sync",
    "single-ticket": "Single ticket",
    "comment-sync": "Comment sync",
    "webhook": "Webhook",
  };
  return labels[type] ?? type;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
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

function StatusIcon({ status }: { status: SyncLogEntry["status"] }) {
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

function statusLabel(status: SyncLogEntry["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Running";
}

export default function SyncLogPage() {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (typeFilter) params.set("type", typeFilter);
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

  const { data: entries, isLoading, mutate } = useSWR<SyncLogEntry[]>(
    `/api/sync-log?${params.toString()}`,
    fetcher,
    { refreshInterval: 10000 },
  );

  const cancelSync = useCallback(async (id: string) => {
    await fetch(`/api/sync-log/${id}/cancel`, { method: "POST" });
    mutate();
  }, [mutate]);

  const cancelAllSyncs = useCallback(async () => {
    await fetch("/api/sync-log/cancel-all", { method: "POST" });
    mutate();
  }, [mutate]);

  const handleFilterChange = useCallback((setter: (v: string) => void) => {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setOffset(0);
    };
  }, []);

  const hasMore = entries?.length === PAGE_SIZE;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-white">
          Sync Log
        </h1>
        <p className="mt-1.5 text-sm text-white/35 font-[var(--font-body)] leading-relaxed">
          Audit trail of all Jira synchronization activity
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <Filter className="h-3.5 w-3.5 text-white/25" strokeWidth={2} />
        {entries?.some((e) => e.status === "running") && (
          <button
            type="button"
            onClick={() => cancelAllSyncs()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400/20 text-xs text-red-400/80 cursor-pointer hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400 active:scale-95 transition-colors duration-150 font-[var(--font-body)]"
          >
            <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
            Stop all syncs
          </button>
        )}
        <SelectFilter
          value={typeFilter}
          options={TYPE_OPTIONS}
          onChange={handleFilterChange(setTypeFilter)}
        />
        <SelectFilter
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={handleFilterChange(setStatusFilter)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_140px_100px_140px_140px] gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
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
            <span className="text-sm text-white/25 font-[var(--font-body)]">No sync entries found</span>
          </div>
        )}

        {/* Rows */}
        {entries?.map((entry, i) => (
          <div
            key={entry.id}
            className={`grid grid-cols-[1fr_140px_100px_140px_140px] gap-3 px-4 py-3 items-start hover:bg-white/[0.015] transition-colors duration-100 ${
              i < (entries.length - 1) ? "border-b border-white/[0.03]" : ""
            }`}
          >
            {/* Type + summary/error */}
            <div className="min-w-0">
              <span className="text-xs text-white/70 font-[var(--font-body)]">
                {entryTypeLabel(entry.type)}
              </span>
              {entry.summary && (
                <div className="text-[11px] text-white/30 truncate font-[var(--font-body)] mt-0.5">
                  {entry.summary}
                </div>
              )}
              {entry.status === "failed" && entry.errorDetail && (
                <div className="text-[11px] text-amber-400/60 truncate font-[var(--font-body)] mt-0.5">
                  {entry.errorDetail}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5">
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
                <button
                  type="button"
                  onClick={() => cancelSync(entry.id)}
                  className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400/70 cursor-pointer hover:bg-red-400/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400 active:scale-95 transition-colors duration-150 font-[var(--font-body)]"
                  title="Cancel this sync"
                >
                  <Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />
                  Cancel
                </button>
              )}
            </div>

            {/* Duration */}
            <span className="text-xs text-white/30 font-[var(--font-body)] tabular-nums">
              {formatDuration(entry.durationMs)}
            </span>

            {/* Scope */}
            <ScopeCell scope={entry.scope} type={entry.type} sprintMap={sprintMap} />

            {/* Timestamp */}
            <span className="text-xs text-white/25 font-[var(--font-body)] tabular-nums text-right">
              {formatTimestamp(entry.startedAt)}
            </span>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-[var(--font-body)] text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-colors duration-150"
        >
          Previous
        </button>
        <span className="text-[11px] text-white/20 font-[var(--font-body)]">
          Showing {offset + 1} - {offset + (entries?.length ?? 0)}
        </span>
        <button
          type="button"
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={!hasMore}
          className="px-3 py-1.5 rounded-lg text-xs font-[var(--font-body)] text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-colors duration-150"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ScopeCell({
  scope,
  type,
  sprintMap,
}: {
  scope: string | null;
  type: SyncLogEntry["type"];
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
