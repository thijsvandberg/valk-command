"use client";

import { useCallback, useMemo } from "react";
import { Layers } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { useEpicProgress } from "@/hooks/useEpics";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { Team } from "@/lib/sprint-utils";
import {
  STORAGE_KEY,
  type EpicStatusBucket,
  type PersistedEpicFilters,
} from "@/lib/epic-filters";
import { EpicRow } from "./EpicRow";
import { EpicFilterBar } from "./EpicFilterBar";
import { EpicListSkeleton } from "./loading";

export default function EpicsPage() {
  const { data: epics, isLoading } = useEpicProgress();
  const { sprints } = useJiraSprints();

  const [filters, setFilters] = useLocalStorage<PersistedEpicFilters>(STORAGE_KEY, {});
  const teamFilter = useMemo(() => filters.teams ?? [], [filters.teams]);
  const statusFilter = useMemo(() => filters.statuses ?? [], [filters.statuses]);

  const toggleTeam = useCallback((team: Team) => {
    setFilters((f) => {
      const prev = f.teams ?? [];
      const next = prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team];
      return { ...f, teams: next };
    });
  }, [setFilters]);

  const toggleStatus = useCallback((status: EpicStatusBucket) => {
    setFilters((f) => {
      const prev = f.statuses ?? [];
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      return { ...f, statuses: next };
    });
  }, [setFilters]);

  const clearTeams = useCallback(() => setFilters((f) => ({ ...f, teams: [] })), [setFilters]);
  const clearStatuses = useCallback(() => setFilters((f) => ({ ...f, statuses: [] })), [setFilters]);
  const clearAll = useCallback(() => setFilters({}), [setFilters]);

  const filtered = useMemo(() => {
    if (!epics) return epics;
    return epics.filter((epic) => {
      const teamOk = teamFilter.length === 0 || teamFilter.some((t) => epic.teams.includes(t));
      const statusOk = statusFilter.length === 0 || statusFilter.includes(epic.status);
      return teamOk && statusOk;
    });
  }, [epics, teamFilter, statusFilter]);

  const filteredOut = !!epics && epics.length > 0 && !!filtered && filtered.length === 0;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader icon={<Layers size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Epics</ViewHeaderTitle>
        {filtered && filtered.length > 0 && (
          <span className="ml-2 rounded-md bg-overlay-default px-2 py-0.5 text-caption font-medium tabular-nums text-text-tertiary">
            {filtered.length}
          </span>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-text-tertiary">
              Feature-level progress across the active sprint, the two most recent closed sprints, and the backlog.
            </p>
            <EpicFilterBar
              teamFilter={teamFilter}
              statusFilter={statusFilter}
              onToggleTeam={toggleTeam}
              onToggleStatus={toggleStatus}
              onClearTeams={clearTeams}
              onClearStatuses={clearStatuses}
              onClearAll={clearAll}
            />
          </div>

          {isLoading ? (
            <EpicListSkeleton />
          ) : !epics || epics.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default py-16 text-center">
              <Layers size={28} strokeWidth={1.5} className="mb-3 text-text-muted" />
              <p className="text-body text-text-secondary">No epics with tickets in the recent sprints.</p>
              <p className="mt-1 text-body-sm text-text-muted">
                Epics appear here once their tickets land in a recent sprint or the backlog.
              </p>
            </div>
          ) : filteredOut ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default py-16 text-center">
              <Layers size={28} strokeWidth={1.5} className="mb-3 text-text-muted" />
              <p className="text-body text-text-secondary">No epics match the current filters.</p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-2 rounded-md px-2 py-1 text-body-sm text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered?.map((epic) => (
                <EpicRow key={epic.key} epic={epic} sprints={sprints} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
