"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";

export interface SearchFilters {
  status: Set<string>;
  type: Set<string>;
  assignee: Set<string>;
  sprint: Set<string>;
  dateRange: string | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  status: new Set(),
  type: new Set(),
  assignee: new Set(),
  sprint: new Set(),
  dateRange: null,
};

export const STATUS_OPTIONS = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

export const STATUS_LABEL_MAP: Record<string, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "In Review",
  DONE: "Done",
  DEPRECATED: "Deprecated",
};

export const TYPE_OPTIONS = ["story", "bug", "task", "spike", "epic"];

export const TYPE_LABEL_MAP: Record<string, string> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
  epic: "Epic",
};

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this-sprint", label: "This sprint" },
  { value: "custom", label: "Custom" },
];

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.status.size > 0 ||
    filters.type.size > 0 ||
    filters.assignee.size > 0 ||
    filters.sprint.size > 0 ||
    !!filters.dateRange
  );
}

export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status.size > 0) params.set("status", [...filters.status].join(","));
  if (filters.type.size > 0) params.set("type", [...filters.type].join(","));
  if (filters.assignee.size > 0) params.set("assignee", [...filters.assignee].join(","));
  if (filters.sprint.size > 0) params.set("sprint", [...filters.sprint].join(","));
  // Only send dateRange when it's a concrete value (not bare "custom" without dates)
  if (filters.dateRange && filters.dateRange !== "custom") {
    params.set("dateRange", filters.dateRange);
  }
  return params;
}

export interface FilterOptionsData {
  assignees: string[];
  sprints: { id: string; name: string }[];
}

interface SearchFilterPanelProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  filterOptions: FilterOptionsData | null;
}

export function SearchFilterPanel({ filters, onChange, filterOptions }: SearchFilterPanelProps) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const selectedDateOption =
    filters.dateRange?.startsWith("custom:") ? "custom" : (filters.dateRange ?? null);

  const sprintOptions = filterOptions?.sprints.map((s) => s.id) ?? [];
  const sprintLabelMap = Object.fromEntries(
    (filterOptions?.sprints ?? []).map((s) => [s.id, s.name])
  );

  function setDateRange(value: string | null) {
    if (value === null || value !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
    onChange({ ...filters, dateRange: value });
  }

  function updateCustomDate(from: string, to: string) {
    const range = from || to ? `custom:${from}..${to}` : "custom";
    onChange({ ...filters, dateRange: range });
  }

  const active = hasActiveFilters(filters);

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-2.5"
      style={{ backgroundColor: "rgba(255,255,255,0.015)" }}
    >
      <FilterDropdown
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status}
        onChange={(next) => onChange({ ...filters, status: next })}
        labelMap={STATUS_LABEL_MAP}
        widthClass="w-48"
      />
      <FilterDropdown
        label="Type"
        options={TYPE_OPTIONS}
        selected={filters.type}
        onChange={(next) => onChange({ ...filters, type: next })}
        labelMap={TYPE_LABEL_MAP}
        widthClass="w-44"
      />
      <FilterDropdown
        label="Sprint"
        options={sprintOptions}
        selected={filters.sprint}
        onChange={(next) => onChange({ ...filters, sprint: next })}
        labelMap={sprintLabelMap}
        searchable
        searchPlaceholder="Search sprints..."
        widthClass="w-64"
      />
      <FilterDropdown
        label="Assignee"
        options={filterOptions?.assignees ?? []}
        selected={filters.assignee}
        onChange={(next) => onChange({ ...filters, assignee: next })}
        searchable
        searchPlaceholder="Search assignees..."
        widthClass="w-56"
      />

      {/* Date range single-select pills */}
      <div className="flex items-center gap-1">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDateRange(selectedDateOption === opt.value ? null : opt.value)}
            className="rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
            style={{
              backgroundColor:
                selectedDateOption === opt.value
                  ? "var(--color-brand-500)"
                  : "rgba(255,255,255,0.03)",
              borderColor:
                selectedDateOption === opt.value
                  ? "var(--color-brand-500)"
                  : "rgba(255,255,255,0.07)",
              color:
                selectedDateOption === opt.value ? "#fff" : "rgba(255,255,255,0.5)",
              transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs, shown when "custom" is selected */}
      {selectedDateOption === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              updateCustomDate(e.target.value, customTo);
            }}
            className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60 focus:outline-none focus:border-[var(--color-brand-500)]/50"
            style={{ colorScheme: "dark" }}
          />
          <span className="text-[10px] text-white/20">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              updateCustomDate(customFrom, e.target.value);
            }}
            className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60 focus:outline-none focus:border-[var(--color-brand-500)]/50"
            style={{ colorScheme: "dark" }}
          />
        </div>
      )}

      {/* Clear all */}
      {active && (
        <button
          type="button"
          onClick={() => {
            setCustomFrom("");
            setCustomTo("");
            onChange(EMPTY_FILTERS);
          }}
          className="ml-auto flex items-center gap-1 text-[11px] text-white/30 cursor-pointer hover:text-white/55 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "color 100ms" }}
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Clear all
        </button>
      )}
    </div>
  );
}
