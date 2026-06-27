"use client";

import { useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ChevronDown, Check } from "lucide-react";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { Checkbox } from "@/components/shared/Checkbox";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { LAST_UPDATED_OPTIONS } from "./refinement-utils";
import type { useRefinementFilters } from "@/hooks/useRefinementFilters";

interface RefinementFiltersProps {
  filters: ReturnType<typeof useRefinementFilters>;
  pinnedSprintIds: Set<string>;
  epicOptions: string[];
}

export function RefinementFilters({
  filters,
  pinnedSprintIds,
  epicOptions,
}: RefinementFiltersProps) {
  const lastUpdatedRef = useRef<HTMLDivElement>(null);

  useOutsideClick(lastUpdatedRef, () => filters.setLastUpdatedOpen(false), { enabled: filters.lastUpdatedOpen });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* Sprint filter */}
      <div className="relative">
        <button
          type="button"
          onClick={() => filters.setSprintFilterOpen(!filters.sprintFilterOpen)}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary hover:bg-hover-interactive hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "background-color 0.12s ease, border-color 0.12s ease" }}
        >
          <span className="text-text-muted">Sprint:</span> {filters.sprintFilterLabel}
          <ChevronDown size={12} strokeWidth={1.5} className="opacity-40" />
        </button>
        {filters.sprintFilterOpen && (
          <SprintListModal
            onClose={() => filters.setSprintFilterOpen(false)}
            onSelect={() => {}}
            onPin={() => {}}
            pinnedIds={pinnedSprintIds}
            alignLeft
            multiSelect
            selectedIds={filters.effectiveSprintFilter}
            onToggleSelect={filters.toggleSprintInFilter}
          />
        )}
      </div>

      {/* Epic filter */}
      <FilterDropdown
        label="Epic"
        options={epicOptions}
        selected={filters.epicFilter}
        onChange={filters.setEpicFilter}
        searchable={epicOptions.length > 6}
        searchPlaceholder="Search epics..."
        renderOption={(epic) => <EpicBadge epic={epic} className="max-w-[240px]" />}
      />

      {/* Last updated filter */}
      <div className="relative" ref={lastUpdatedRef}>
        <button
          type="button"
          onClick={() => filters.setLastUpdatedOpen(!filters.lastUpdatedOpen)}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary hover:bg-hover-interactive hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "background-color 0.12s ease, border-color 0.12s ease" }}
        >
          <span className="text-text-muted">Updated:</span> {filters.lastUpdatedLabel}
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={`opacity-40 ${filters.lastUpdatedOpen ? "rotate-180" : ""}`}
            style={{ transition: "transform 0.15s ease" }}
          />
        </button>
        {filters.lastUpdatedOpen && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-40 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
            {LAST_UPDATED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  filters.setLastUpdatedFilter(opt.value);
                  filters.setLastUpdatedOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-body-sm hover:bg-hover-list-item ${
                  filters.lastUpdatedFilter === opt.value
                    ? "font-medium text-text-primary"
                    : "text-text-secondary"
                } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                style={{ transition: "background-color 80ms" }}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {filters.lastUpdatedFilter === opt.value && (
                    <Check size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
                  )}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hide estimated toggle */}
      <button
        type="button"
        onClick={() => filters.setHideEstimated(!filters.hideEstimated)}
        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-label font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] ${
          filters.hideEstimated
            ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
            : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive hover:border-border-strong"
        }`}
        style={{ transition: "background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 80ms" }}
      >
        <Checkbox checked={filters.hideEstimated} />
        Hide estimated
      </button>
    </div>
  );
}
