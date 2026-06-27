"use client";

import { useCallback, useMemo, useState } from "react";
import { Zap, Plus } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useEpicProgress } from "@/hooks/useEpics";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { useMigratedAccountSetting } from "@/hooks/useMigratedAccountSetting";
import type { Team } from "@/lib/sprint-utils";
import type { JiraStatus } from "@/types/ticket";
import {
  STORAGE_KEY,
  type PersistedEpicFilters,
} from "@/lib/epic-filters";
import { EpicRow } from "./EpicRow";
import { EpicFilterBar } from "./EpicFilterBar";
import { EpicListSkeleton } from "./loading";
import { CreateEpicModal } from "./CreateEpicModal";

// Stable default so the account-setting SWR fallback never churns identity.
const EMPTY_EPIC_FILTERS: PersistedEpicFilters = {};

export default function EpicsPage() {
  const { data: epics, isLoading, error, mutate } = useEpicProgress();
  const { sprints } = useJiraSprints();
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const { value: filters, setValue: setFilters } = useMigratedAccountSetting<PersistedEpicFilters>(
    "/api/settings/epic-filters",
    STORAGE_KEY,
    EMPTY_EPIC_FILTERS,
  );
  const teamFilter = useMemo(() => filters.teams ?? [], [filters.teams]);
  const statusFilter = useMemo(() => filters.statuses ?? [], [filters.statuses]);
  const noTeam = filters.noTeam ?? false;

  const toggleTeam = useCallback((team: Team) => {
    setFilters((f) => {
      const prev = f.teams ?? [];
      const next = prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team];
      return { ...f, teams: next };
    });
  }, [setFilters]);

  const toggleNoTeam = useCallback(() => {
    setFilters((f) => ({ ...f, noTeam: !(f.noTeam ?? false) }));
  }, [setFilters]);

  const toggleStatus = useCallback((status: JiraStatus) => {
    setFilters((f) => {
      const prev = f.statuses ?? [];
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      return { ...f, statuses: next };
    });
  }, [setFilters]);

  const clearTeams = useCallback(() => setFilters((f) => ({ ...f, teams: [], noTeam: false })), [setFilters]);
  const clearStatuses = useCallback(() => setFilters((f) => ({ ...f, statuses: [] })), [setFilters]);
  const clearAll = useCallback(() => setFilters({}), [setFilters]);

  const teamActive = teamFilter.length > 0 || noTeam;
  const anyFilterActive = teamActive || statusFilter.length > 0;

  const filtered = useMemo(() => {
    if (!epics) return epics;
    return epics.filter((epic) => {
      // Default view = recent-activity epics only; any active filter widens the
      // pool to all epics so old/done/deprecated ones can be found and cleaned up.
      if (!anyFilterActive && !epic.recentActivity) return false;
      const teamOk =
        !teamActive ||
        teamFilter.some((t) => epic.teams.includes(t)) ||
        (noTeam && epic.teams.length === 0);
      const statusOk = statusFilter.length === 0 || statusFilter.includes(epic.status);
      return teamOk && statusOk;
    });
  }, [epics, teamFilter, noTeam, statusFilter, teamActive, anyFilterActive]);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        icon={<Zap size={16} strokeWidth={1.5} />}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            icon={<Plus size={14} strokeWidth={2} />}
          >
            Create epic
          </Button>
        }
      >
        <ViewHeaderTitle>Epics</ViewHeaderTitle>
        {filtered && filtered.length > 0 && (
          <span className="ml-2 rounded-md bg-overlay-default px-2 py-0.5 text-caption font-medium tabular-nums text-text-tertiary">
            {filtered.length}
          </span>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-text-tertiary">
              Feature-level progress across the active sprint, the two most recent closed sprints, and the backlog.
            </p>
            <EpicFilterBar
              teamFilter={teamFilter}
              noTeam={noTeam}
              statusFilter={statusFilter}
              onToggleTeam={toggleTeam}
              onToggleNoTeam={toggleNoTeam}
              onToggleStatus={toggleStatus}
              onClearTeams={clearTeams}
              onClearStatuses={clearStatuses}
              onClearAll={clearAll}
            />
          </div>

          {/* A failed fetch is otherwise invisible (SWR does not throw): the page
              would show the "no epics" empty state and look like clean data. */}
          {error && epics && (
            <DataErrorState error={error} onRetry={() => void mutate()} className="mb-4" />
          )}

          {error && !epics ? (
            <DataErrorState variant="full" error={error} onRetry={() => void mutate()} className="py-16" />
          ) : isLoading ? (
            <EpicListSkeleton />
          ) : filtered && filtered.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {filtered.map((epic) => (
                <EpicRow key={epic.key} epic={epic} sprints={sprints} />
              ))}
            </div>
          ) : anyFilterActive ? (
            <EmptyState
              icon={<Zap size={22} strokeWidth={1.5} className="text-text-muted" />}
              title="No epics match the current filters"
              action={
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              }
              className="py-16"
            />
          ) : (
            <EmptyState
              icon={<Zap size={22} strokeWidth={1.5} className="text-text-muted" />}
              title="No epics with tickets in the recent sprints"
              description="Use the team or status filters to browse all epics, including done and deprecated ones."
              className="py-16"
            />
          )}
        </div>
      </div>

      {createOpen && (
        <CreateEpicModal onClose={() => setCreateOpen(false)} showToast={showToast} />
      )}
      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
  );
}
