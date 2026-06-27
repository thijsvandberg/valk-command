"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { swrFetcher, epics as epicsApi } from "@/lib/api-client";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { FilterChip } from "@/components/shared/FilterChip";
import { IssueTypeOption } from "@/components/shared/IssueTypeOption";
import { StatusOption } from "@/components/shared/StatusOption";
import { Avatar } from "@/components/shared/Avatar";
import { userInitials, userColor } from "@/components/shared/AssigneePicker";
import { extractTeamPrefix, TEAMS } from "@/lib/sprint-utils";
import { Link2, X } from "lucide-react";
import type { LinkFilterState, LinkSearchFacets } from "@/hooks/useLinkIssueSearch";

interface SprintsResponse {
  sprints: Array<{ id: number; name: string; state: string }>;
}
type EpicListItem = { key: string; name: string };

// Relative "last updated" buckets, mirroring the route's accepted values.
const UPDATED_BUCKETS: { value: string; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const asSet = (a: string[]) => new Set(a);

interface LinkIssueFilterBarProps {
  filters: LinkFilterState;
  facets: LinkSearchFacets;
  filtersActive: boolean;
  setFilter: <K extends keyof LinkFilterState>(key: K, value: LinkFilterState[K]) => void;
  applyPreset: (preset: "epic" | "sprint") => void;
  clearFilters: () => void;
}

export function LinkIssueFilterBar({
  filters,
  facets,
  filtersActive,
  setFilter,
  applyPreset,
  clearFilters,
}: LinkIssueFilterBarProps) {
  // Sprints carry their state so the label can read "Sprint 7 (active)".
  const { data: sprintData } = useSWR<SprintsResponse>("/api/jira/sprints", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const { data: epicData } = useSWR<EpicListItem[]>(epicsApi.listUrl(), swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Active-first, then future, then closed; newest id first within each bucket.
  const orderedSprints = useMemo(() => {
    const rank: Record<string, number> = { active: 0, future: 1, closed: 2 };
    return [...(sprintData?.sprints ?? [])].sort((a, b) => {
      const ra = rank[a.state] ?? 3;
      const rb = rank[b.state] ?? 3;
      return ra !== rb ? ra - rb : b.id - a.id;
    });
  }, [sprintData]);

  // Teams are derived from the sprint-name prefix ("BT: 138" -> BT), then
  // intersected with the canonical TEAMS so stray prefixes (e.g. "VPL: ...")
  // don't leak in as fake teams. Canonical order is preserved.
  const teamOptions = useMemo(() => {
    const present = new Set<string>();
    for (const s of orderedSprints) {
      const team = extractTeamPrefix(s.name);
      if (team) present.add(team);
    }
    return TEAMS.filter((t) => present.has(t));
  }, [orderedSprints]);

  // Selecting a team narrows the (long) sprint list to that team's sprints, so
  // you no longer have to hunt for the right team's sprint.
  const { sprintOptions, sprintLabelMap } = useMemo(() => {
    const teamSet = new Set(filters.teams);
    const visible = teamSet.size > 0
      ? orderedSprints.filter((s) => {
          const team = extractTeamPrefix(s.name);
          return team ? teamSet.has(team) : false;
        })
      : orderedSprints;
    const labelMap: Record<string, string> = {};
    for (const s of orderedSprints) labelMap[String(s.id)] = `${s.name} (${s.state})`;
    return { sprintOptions: visible.map((s) => String(s.id)), sprintLabelMap: labelMap };
  }, [orderedSprints, filters.teams]);

  const { epicOptions, epicLabelMap } = useMemo(() => {
    const list = epicData ?? [];
    const labelMap: Record<string, string> = {};
    for (const e of list) labelMap[e.key] = e.name || e.key;
    return { epicOptions: list.map((e) => e.key), epicLabelMap: labelMap };
  }, [epicData]);

  // Issue types / statuses come from the server facets; types are normalized to
  // lowercase so the selection matches what the route compares against.
  const typeOptions = useMemo(
    () => Array.from(new Set(facets.types.map((t) => t.toLowerCase()))).sort(),
    [facets.types],
  );

  const showProject = facets.projects.length > 1;

  function toggleUpdated(value: string) {
    setFilter("updatedWithin", filters.updatedWithin === value ? null : value);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {facets.statuses.length > 0 && (
        <FilterDropdown
          label="Status"
          options={facets.statuses}
          selected={asSet(filters.statuses)}
          onChange={(next) => setFilter("statuses", [...next])}
          renderOption={(v) => <StatusOption value={v} />}
        />
      )}

      <FilterDropdown
        label="Type"
        options={typeOptions}
        selected={asSet(filters.types)}
        onChange={(next) => setFilter("types", [...next])}
        renderOption={(v) => <IssueTypeOption value={v} />}
      />

      {teamOptions.length > 0 && (
        <FilterDropdown
          label="Team"
          options={teamOptions}
          selected={asSet(filters.teams)}
          onChange={(next) => setFilter("teams", [...next])}
        />
      )}

      {orderedSprints.length > 0 && (
        <FilterDropdown
          label="Sprint"
          options={sprintOptions}
          selected={asSet(filters.sprints)}
          onChange={(next) => setFilter("sprints", [...next])}
          searchable
          searchPlaceholder="Search sprints..."
          labelMap={sprintLabelMap}
          widthClass="w-64"
          renderOption={(id) => <span>{sprintLabelMap[id] ?? id}</span>}
        />
      )}

      {epicOptions.length > 0 && (
        <FilterDropdown
          label="Epic"
          options={epicOptions}
          selected={asSet(filters.epics)}
          onChange={(next) => setFilter("epics", [...next])}
          searchable
          searchPlaceholder="Search epics..."
          labelMap={epicLabelMap}
          widthClass="w-64"
          renderOption={(key) => <span className="truncate">{epicLabelMap[key] ?? key}</span>}
        />
      )}

      {facets.assignees.length > 0 && (
        <FilterDropdown
          label="Assignee"
          options={facets.assignees}
          selected={asSet(filters.assignees)}
          onChange={(next) => setFilter("assignees", [...next])}
          searchable
          searchPlaceholder="Search assignees..."
          renderOption={(name) => (
            <span className="flex items-center gap-2">
              <Avatar assignee={{ name, initials: userInitials(name), color: userColor(name) }} size={20} />
              <span className="truncate">{name}</span>
            </span>
          )}
        />
      )}

      {showProject && (
        <FilterDropdown
          label="Project"
          options={facets.projects}
          selected={asSet(filters.projects)}
          onChange={(next) => setFilter("projects", [...next])}
        />
      )}

      <span className="mx-0.5 h-5 w-px self-center bg-border-default" aria-hidden />

      {/* Last updated: single-pick buckets ("within X"). */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-text-muted">Updated</span>
        {UPDATED_BUCKETS.map((b) => (
          <FilterChip
            key={b.value}
            active={filters.updatedWithin === b.value}
            onClick={() => toggleUpdated(b.value)}
          >
            {b.label}
          </FilterChip>
        ))}
      </div>

      {/* Context presets relative to the current ticket. */}
      <FilterChip active={filters.preset === "epic"} onClick={() => applyPreset("epic")}>
        <span className="flex items-center gap-1">
          <Link2 size={11} strokeWidth={2} /> Same epic
        </span>
      </FilterChip>
      <FilterChip active={filters.preset === "sprint"} onClick={() => applyPreset("sprint")}>
        <span className="flex items-center gap-1">
          <Link2 size={11} strokeWidth={2} /> Same sprint
        </span>
      </FilterChip>

      {filtersActive && (
        <button
          type="button"
          onClick={clearFilters}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-label text-text-muted transition-[color,transform] duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
          title="Clear all filters"
        >
          <X size={11} strokeWidth={1.5} /> Clear
        </button>
      )}
    </div>
  );
}
