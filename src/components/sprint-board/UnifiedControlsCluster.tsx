"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ExpandableSearch } from "@/components/sprint-board/ExpandableSearch";
import { SortDropdown } from "@/components/sprint-board/SortControls";
import { FilterControlsPanel, type FilterControlsPanelProps } from "@/components/sprint-board/FilterControlsPanel";
import type { SortField, SortDir } from "@/components/sprint-board/filter-bar-types";

// The single segmented control on the right of the views bar: search · sort · filter
// in one ringed group (BRDG-344). Replaces the loose search field, the standalone
// sort/field-toggle buttons, and the separate filter bar row.
export function UnifiedControlsCluster({
  searchQuery,
  onSearchChange,
  searchCount,
  sortField,
  sortDir,
  onSortChange,
  activeFilterCount,
  filterProps,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchCount?: { matched: number; total: number };
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  activeFilterCount: number;
  filterProps: FilterControlsPanelProps;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useOutsideClick(filterRef, () => setFilterOpen(false), { enabled: filterOpen, escapeClose: true });

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Search -- leading control, expands inline */}
      <ExpandableSearch value={searchQuery} onChange={onSearchChange} count={searchCount} />

      {/* Sort -- self-contained dropdown, unchanged */}
      <SortDropdown field={sortField} direction={sortDir} onChange={onSortChange} />

      {/* Filter -- opens the two-pane panel */}
      <div ref={filterRef} className="relative">
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-body-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            activeFilterCount > 0 || filterOpen
              ? "font-semibold text-[var(--color-brand-600)]"
              : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
          }`}
          style={{
            transition: "background-color 120ms, color 120ms",
            backgroundColor: activeFilterCount > 0 || filterOpen ? "color-mix(in srgb, var(--color-brand-500) 14%, transparent)" : undefined,
          }}
          title="Filters"
          aria-label="Filters"
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span
              className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-caption font-bold text-[var(--color-brand-600)]"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-500) 30%, transparent)" }}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`h-3 w-3 text-text-muted ${filterOpen ? "rotate-180" : ""}`}
            strokeWidth={2}
            style={{ transition: "transform 150ms" }}
          />
        </button>
        {filterOpen && <FilterControlsPanel {...filterProps} />}
      </div>
    </div>
  );
}
