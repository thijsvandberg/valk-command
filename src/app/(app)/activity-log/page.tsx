"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useActivityContext } from "@/contexts/ActivityContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import useSWR from "swr";
import {
  RefreshCw,
  Filter,
  Square,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { activityLog } from "@/lib/api-client";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import type {
  ActivityLogEntry,
  ActivityLogStatsResponse,
  ActivityLogStats,
} from "@/types/ticket";
import { fetcher, statsFetcher, PAGE_SIZE, TYPE_OPTIONS, STATUS_OPTIONS } from "./activity-helpers";
import { StatsBar, HealthScoreBadge } from "./StatsBar";
import { RecurringFailures } from "./RecurringFailures";
import { EventTimeline } from "./EventTimeline";
import { ActivityTable, SelectFilter } from "./ActivityTable";

export default function ActivityLogPage() {
  const pageTitle = usePageTitle("Activity Log");
  const { acknowledgeAllErrors, mutateActivityLog } = useActivityContext();

  useEffect(() => {
    acknowledgeAllErrors();
  }, [acknowledgeAllErrors]);

  const [storedTypes, setStoredTypes] = useLocalStorage<string[]>("bridge:activity-types", []);
  const selectedTypes = useMemo(() => new Set(storedTypes), [storedTypes]);
  const [statusFilter, setStatusFilter] = useLocalStorage<string>("bridge:activity-status", "");
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
    await activityLog.cancel(id);
    mutate();
  }, [mutate]);

  const cancelAllSyncs = useCallback(async () => {
    await activityLog.cancelAll();
    mutate();
  }, [mutate]);

  const acknowledgeEntry = useCallback(async (id: string) => {
    await activityLog.acknowledge(id);
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
    setStoredTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    setOffset(0);
  }, [setStoredTypes]);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setOffset(0);
  }, [setStatusFilter]);

  // Jump to a specific entry: clear filters, reset pagination, expand the target row
  const jumpToEntry = useCallback((id: string) => {
    setStoredTypes([]);
    setStatusFilter("");
    setOffset(0);
    setExpandedIds(new Set([id]));
    setJumpTarget(id);
  }, [setStoredTypes, setStatusFilter]);

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

  const rowRefsCallback = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);

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

        {stats && (
          <StatsBar today={stats.today} yesterday={stats.yesterday} />
        )}

        {stats && (
          <RecurringFailures
            failures={stats.recurringFailures}
            sprintMap={sprintMap}
            onJumpToEntry={jumpToEntry}
          />
        )}

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
              className="flex items-center gap-1.5 rounded-lg border border-border-default bg-transparent px-2.5 py-1.5 text-xs text-white/40 cursor-pointer hover:border-white/[0.1] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
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
                className={`px-2.5 py-1 rounded-md text-label font-[var(--font-body)] cursor-pointer border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 ${
                  selectedTypes.has(opt.value)
                    ? "border-[var(--color-brand-400)]/30 bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)]"
                    : "border-border-default bg-transparent text-white/35 hover:border-white/[0.1] hover:text-white/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {selectedTypes.size > 0 && (
              <button
                type="button"
                onClick={() => { setStoredTypes([]); setOffset(0); }}
                className="px-2.5 py-1 rounded-md text-label font-[var(--font-body)] text-white/25 cursor-pointer hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-colors duration-150"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <ActivityTable
          entries={entries}
          isLoading={isLoading}
          expandedIds={expandedIds}
          sprintMap={sprintMap}
          offset={offset}
          hasMore={hasMore}
          onToggleExpanded={toggleExpanded}
          onCancelSync={cancelSync}
          onAcknowledgeEntry={acknowledgeEntry}
          onSetOffset={setOffset}
          rowRefsCallback={rowRefsCallback}
        />
      </div>
    </>
  );
}
