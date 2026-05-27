"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { GitBranch, RefreshCw, Unlink } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { usePipelines } from "@/hooks/usePipelines";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  PAGE_SIZE,
  STORAGE_KEY,
  getDateCutoff,
  type PersistedFilters,
  type StatusFilterValue,
  type DateRangeValue,
} from "./pipeline-helpers";
import { PipelineMetrics, SprintPipelineSummary } from "./MetricsPanel";
import { StatusFilter, DateRangeFilter, CreatorFilter, RepoFilter, SprintFilter } from "./FilterBar";
import { PipelineTable, RunningSection, GroupedByTicketView } from "./PipelineList";
import { DeploySettingsPanel, DeploymentTimeline } from "./DeploySettings";
import { PipelineSkeleton, SyncStatusBanner } from "./PipelineSkeleton";

const EMPTY_FILTERS: PersistedFilters = {};

// Read the initial persisted sprint selection synchronously so we can guard
// against overwriting it with an auto-selection before hydration completes.
function readInitialSprints(): string[] | undefined {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) return (JSON.parse(raw) as PersistedFilters).sprints;
  } catch { /* noop */ }
  return undefined;
}

export default function PipelinesPage() {
  const [persisted, setPersisted] = useLocalStorage<PersistedFilters>(STORAGE_KEY, EMPTY_FILTERS);
  // Captured once so auto-selection doesn't overwrite a stored sprint list that
  // is still being hydrated from localStorage by useLocalStorage.
  const initialPersistedSprints = useRef<string[] | undefined>(readInitialSprints());

  const repoFilter = persisted.repo ?? null;
  const sprintFilters = useMemo(() => persisted.sprints ?? [], [persisted.sprints]);
  const statusFilter: StatusFilterValue = persisted.status ?? "all";
  const dateRange: DateRangeValue = persisted.dateRange ?? "all";
  const creatorFilters = useMemo(() => persisted.creators ?? [], [persisted.creators]);
  const showUnlinked = persisted.unlinked ?? false;

  const setRepoFilter = useCallback((v: string | null) => setPersisted((p) => ({ ...p, repo: v })), [setPersisted]);
  const setSprintFilters = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    setPersisted((p) => {
      const prev = p.sprints ?? [];
      const next = typeof v === "function" ? v(prev) : v;
      return { ...p, sprints: next };
    });
  }, [setPersisted]);
  const setStatusFilter = useCallback((v: StatusFilterValue | ((prev: StatusFilterValue) => StatusFilterValue)) => {
    setPersisted((p) => {
      const prev = p.status ?? "all";
      const next = typeof v === "function" ? v(prev) : v;
      return { ...p, status: next };
    });
  }, [setPersisted]);
  const setDateRange = useCallback((v: DateRangeValue) => setPersisted((p) => ({ ...p, dateRange: v })), [setPersisted]);
  const setCreatorFilters = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    setPersisted((p) => {
      const prev = p.creators ?? [];
      const next = typeof v === "function" ? v(prev) : v;
      return { ...p, creators: next };
    });
  }, [setPersisted]);
  const setShowUnlinked = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setPersisted((p) => {
      const prev = p.unlinked ?? false;
      const next = typeof v === "function" ? v(prev) : v;
      return { ...p, unlinked: next };
    });
  }, [setPersisted]);

  const [sprintAutoSelected, setSprintAutoSelected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  const { sprints } = useJiraSprints();

  // Default to active sprint on first load (only if no persisted filters)
  if (sprints && sprintFilters.length === 0 && !sprintAutoSelected && !initialPersistedSprints.current?.length) {
    const active = sprints.find((s) => s.state === "active");
    if (active) {
      setSprintFilters([String(active.id)]);
      setSprintAutoSelected(true);
    }
  }

  // Toggle helpers
  const toggleSprint = useCallback((id: string) => {
    setSprintFilters((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, [setSprintFilters]);

  const toggleCreator = useCallback((name: string) => {
    setCreatorFilters((prev) => prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]);
  }, [setCreatorFilters]);

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
    sprintTickets: showUnlinked ? undefined : sprintTicketKeys,
    unlinked: showUnlinked,
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
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [repoFilter, statusFilter, dateRange, creatorFilters, sprintFilters, showUnlinked]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  // Keyboard shortcuts
  // Only sprints and sprintFilters are captured by value; refresh is listed
  // so the dependency array is complete and no suppression comment is needed.
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setRefreshing(true);
      refresh().finally(() => setRefreshing(false));
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
  }, [refresh, sprints, sprintFilters, setSprintFilters, setStatusFilter]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  const activeFilterCount = [
    statusFilter !== "all",
    dateRange !== "all",
    creatorFilters.length > 0,
    repoFilter !== null,
    showUnlinked,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<GitBranch size={16} strokeWidth={1.5} />}
        actions={
          <div className="flex items-center gap-2">
            {hasRunning && (
              <span className="flex items-center gap-1.5 text-label text-[var(--color-brand-400)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
                Live
              </span>
            )}
            {sprints && <SprintFilter sprints={sprints} selected={sprintFilters} onToggle={toggleSprint} onClear={() => setSprintFilters([])} />}
            <Button
              variant="ghost"
              size="md"
              icon={<Unlink size={12} strokeWidth={1.5} />}
              onClick={() => setShowUnlinked((prev) => !prev)}
              className={showUnlinked ? "border-amber-500/30 text-amber-400" : ""}
              title="Show unlinked runs only"
            >
              Unlinked
            </Button>
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
              aria-label="Refresh pipelines"
            />
          </div>
        }
      >
        <ViewHeaderTitle>Pipelines</ViewHeaderTitle>
        {hasRunning && (
          <span className="ml-2 rounded-md bg-[var(--color-brand-500)]/15 px-2 py-0.5 text-caption font-medium text-[var(--color-brand-400)]">
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
              setShowUnlinked(false);
            }}
            className="ml-2 rounded-md bg-overlay-default px-2 py-0.5 text-caption font-medium text-text-tertiary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150"
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
              {showUnlinked ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Unlink size={14} strokeWidth={1.5} className="text-amber-400/60" />
                    <span className="text-body-sm font-medium text-text-secondary uppercase tracking-wider">
                      Unlinked runs
                    </span>
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-caption font-medium text-amber-400/60 tabular-nums">
                      {filteredRuns.length}
                    </span>
                    <span className="text-label text-text-muted">
                      Runs without a ticket key
                    </span>
                  </div>
                  <PipelineTable runs={paginatedRuns} repoFilter={null} ticketTitleMap={ticketTitleMap} />
                </>
              ) : sprintFilters.length > 0 ? (
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
              <div className="mt-6 flex items-center justify-center gap-4 text-caption text-text-muted">
                <span><kbd className="px-1 py-0.5 rounded bg-overlay-default text-text-muted font-mono">R</kbd> Refresh</span>
                <span><kbd className="px-1 py-0.5 rounded bg-overlay-default text-text-muted font-mono">F</kbd> Cycle status filter</span>
                <span><kbd className="px-1 py-0.5 rounded bg-overlay-default text-text-muted font-mono">S</kbd> Toggle sprint</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
