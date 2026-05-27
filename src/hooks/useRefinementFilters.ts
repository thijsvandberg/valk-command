import { useState, useCallback, useMemo } from "react";
import { LAST_UPDATED_OPTIONS } from "@/components/refinement-session/refinement-utils";

export function useRefinementFilters(pinnedSprintIds: Set<string>, sprintNameMap: Record<string, string>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sprintFilter, setSprintFilter] = useState<Set<string> | null>(null);
  const [hideEstimated, setHideEstimated] = useState(true);
  const [epicFilter, setEpicFilter] = useState<Set<string>>(new Set());
  const [lastUpdatedFilter, setLastUpdatedFilter] = useState("4w");
  const [lastUpdatedOpen, setLastUpdatedOpen] = useState(false);
  const [sprintFilterOpen, setSprintFilterOpen] = useState(false);

  const effectiveSprintFilter = sprintFilter ?? pinnedSprintIds;

  const toggleSprintInFilter = useCallback((id: string) => {
    setSprintFilter((prev) => {
      const current = prev ?? new Set(pinnedSprintIds);
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [pinnedSprintIds]);

  const sprintFilterLabel = useMemo(() => {
    if (effectiveSprintFilter.size === 0) return "All";
    if (effectiveSprintFilter.size === pinnedSprintIds.size &&
        [...effectiveSprintFilter].every((id) => pinnedSprintIds.has(id))) {
      return "Pinned";
    }
    if (effectiveSprintFilter.size === 1) {
      const id = [...effectiveSprintFilter][0];
      return sprintNameMap[id] ?? id;
    }
    return `${effectiveSprintFilter.size} sprints`;
  }, [effectiveSprintFilter, pinnedSprintIds, sprintNameMap]);

  const lastUpdatedLabel = useMemo(() => {
    const opt = LAST_UPDATED_OPTIONS.find((o) => o.value === lastUpdatedFilter);
    return opt?.label ?? "4 weeks";
  }, [lastUpdatedFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!hideEstimated) count++;
    if (epicFilter.size > 0) count++;
    if (lastUpdatedFilter !== "4w") count++;
    if (sprintFilter !== null) count++;
    return count;
  }, [hideEstimated, epicFilter, lastUpdatedFilter, sprintFilter]);

  return {
    filtersOpen,
    setFiltersOpen,
    hideEstimated,
    setHideEstimated,
    epicFilter,
    setEpicFilter,
    lastUpdatedFilter,
    setLastUpdatedFilter,
    lastUpdatedOpen,
    setLastUpdatedOpen,
    sprintFilterOpen,
    setSprintFilterOpen,
    effectiveSprintFilter,
    toggleSprintInFilter,
    sprintFilterLabel,
    lastUpdatedLabel,
    activeFilterCount,
  };
}
