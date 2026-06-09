"use client";

import { useState } from "react";
import { X, Tag, MessageSquare, MessageCircle } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { IssueTypeOption } from "@/components/shared/IssueTypeOption";
import { StatusOption } from "@/components/shared/StatusOption";
import { ReadinessOption } from "@/components/shared/ReadinessOption";
import { READINESS_OPTIONS } from "@/types/ticket";
import { userColor, userInitials } from "@/lib/user-display";

export interface SearchFilters {
  sections: Set<string>;
  status: Set<string>;
  readiness: Set<string>;
  type: Set<string>;
  assignee: Set<string>;
  sprint: Set<string>;
  dateRange: string | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  sections: new Set(),
  status: new Set(),
  readiness: new Set(),
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

export const TYPE_OPTIONS = ["story", "bug", "task", "spike", "epic", "subtask"];

export const TYPE_LABEL_MAP: Record<string, string> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
  epic: "Epic",
  subtask: "Subtask",
};

// Readiness filter options: the four lifecycle states plus a "none" sentinel
// (null readiness = ready for development), mirroring the Sprint Board (BRDG-324).
const READINESS_FILTER_OPTIONS = READINESS_OPTIONS.map((o) => o.value ?? "none");

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "28d", label: "Last 28 days" },
  { value: "custom", label: "Custom range" },
];

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.sections.size > 0 ||
    filters.status.size > 0 ||
    filters.readiness.size > 0 ||
    filters.type.size > 0 ||
    filters.assignee.size > 0 ||
    filters.sprint.size > 0 ||
    !!filters.dateRange
  );
}

export interface SerializedSearchFilters {
  sections: string[];
  status: string[];
  readiness: string[];
  type: string[];
  assignee: string[];
  sprint: string[];
  dateRange: string | null;
}

export function serializeFilters(filters: SearchFilters): SerializedSearchFilters {
  return {
    sections: [...filters.sections],
    status: [...filters.status],
    readiness: [...filters.readiness],
    type: [...filters.type],
    assignee: [...filters.assignee],
    sprint: [...filters.sprint],
    dateRange: filters.dateRange,
  };
}

// Accepts a legacy `poStatus` field from searches saved before the PO Status -> Readiness
// switch (BRDG-324). The legacy free-text values are dropped, not migrated, since the two
// filters no longer mean the same thing.
export function deserializeFilters(raw: SerializedSearchFilters & { poStatus?: string[] }): SearchFilters {
  return {
    sections: new Set(raw.sections),
    status: new Set(raw.status),
    readiness: new Set(raw.readiness ?? []),
    type: new Set(raw.type),
    assignee: new Set(raw.assignee),
    sprint: new Set(raw.sprint),
    dateRange: raw.dateRange,
  };
}

export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status.size > 0) params.set("status", [...filters.status].join(","));
  if (filters.readiness.size > 0) params.set("readiness", [...filters.readiness].join(","));
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
  poStatuses: string[];
}

export interface SectionCounts {
  tickets: number;
  conversations: number;
  comments: number;
}

interface SearchFilterPanelProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  filterOptions: FilterOptionsData | null;
  sectionCounts?: SectionCounts;
}

function AssigneeAvatar({ name }: { name: string }) {
  const initials = userInitials(name);
  const color = userColor(name);
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, fontSize: 9 }}
      title={name}
    >
      {initials}
    </span>
  );
}

const SECTION_DEFS = [
  { key: "tickets", label: "Tickets", icon: <Tag className="h-3 w-3" strokeWidth={1.5} /> },
  { key: "conversations", label: "Conversations", icon: <MessageSquare className="h-3 w-3" strokeWidth={1.5} /> },
  { key: "comments", label: "Comments", icon: <MessageCircle className="h-3 w-3" strokeWidth={1.5} /> },
] as const;

export function SearchFilterPanel({ filters, onChange, filterOptions, sectionCounts }: SearchFilterPanelProps) {
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

  function toggleSection(key: string) {
    const next = new Set(filters.sections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...filters, sections: next });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border-default px-5 py-2.5"
      style={{ backgroundColor: "var(--color-overlay-subtle)" }}
    >
      <FilterDropdown
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status}
        onChange={(next) => onChange({ ...filters, status: next })}
        labelMap={STATUS_LABEL_MAP}
        renderOption={(val) => <StatusOption value={val} />}
        widthClass="w-48"
      />
      <FilterDropdown
        label="Readiness"
        options={READINESS_FILTER_OPTIONS}
        selected={filters.readiness}
        onChange={(next) => onChange({ ...filters, readiness: next })}
        renderOption={(val) => <ReadinessOption value={val} />}
        widthClass="w-52"
      />
      <FilterDropdown
        label="Type"
        options={TYPE_OPTIONS}
        selected={filters.type}
        onChange={(next) => onChange({ ...filters, type: next })}
        labelMap={TYPE_LABEL_MAP}
        renderOption={(val) => <IssueTypeOption value={val} />}
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
        renderOption={(val) => (
          <span className="flex items-center gap-2">
            <AssigneeAvatar name={val} />
            <span>{val}</span>
          </span>
        )}
        widthClass="w-56"
      />

      {/* Separator between dropdowns and date range */}
      <div className="h-5 w-px shrink-0 bg-overlay-strong" />

      {/* Date range single-select pills */}
      <div className="flex items-center gap-1 shrink-0">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDateRange(selectedDateOption === opt.value ? null : opt.value)}
            className="rounded-md border px-2 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] whitespace-nowrap"
            style={{
              backgroundColor:
                selectedDateOption === opt.value
                  ? "var(--color-brand-500)"
                  : "var(--color-overlay-subtle)",
              borderColor:
                selectedDateOption === opt.value
                  ? "var(--color-brand-500)"
                  : "var(--color-overlay-default)",
              color:
                selectedDateOption === opt.value ? "#fff" : "var(--color-text-secondary)",
              transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs, shown when "custom range" is selected */}
      {selectedDateOption === "custom" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              updateCustomDate(e.target.value, customTo);
            }}
            className="rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label text-text-secondary focus:outline-none focus:border-[var(--color-brand-500)]/50"
            style={{ colorScheme: "dark" }}
          />
          <span className="text-caption text-text-muted">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              updateCustomDate(customFrom, e.target.value);
            }}
            className="rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label text-text-secondary focus:outline-none focus:border-[var(--color-brand-500)]/50"
            style={{ colorScheme: "dark" }}
          />
        </div>
      )}

      {/* Separator between date group and section chips */}
      <div className="h-5 w-px shrink-0 bg-overlay-strong" />

      {/* Section filter chips — single-row, same height as date pills */}
      {SECTION_DEFS.map((s) => {
        const isActive = filters.sections.has(s.key);
        const count = sectionCounts?.[s.key] ?? 0;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => toggleSection(s.key)}
            aria-label={`Filter by ${s.label}`}
            aria-pressed={isActive}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] whitespace-nowrap shrink-0"
            style={{
              backgroundColor: isActive ? "color-mix(in srgb, var(--color-status-success) 12%, transparent)" : "var(--color-overlay-subtle)",
              borderColor: isActive ? "color-mix(in srgb, var(--color-status-success) 35%, transparent)" : "var(--color-overlay-default)",
              color: isActive ? "var(--color-brand-400)" : "var(--color-text-secondary)",
              transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms",
            }}
          >
            {s.icon}
            {s.label}
            {count > 0 && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: isActive ? "var(--color-brand-400)" : "var(--color-text-tertiary)" }}
              />
            )}
          </button>
        );
      })}

      {/* Clear all */}
      {active && (
        <button
          type="button"
          onClick={() => {
            setCustomFrom("");
            setCustomTo("");
            onChange({ ...EMPTY_FILTERS });
          }}
          className="ml-auto flex items-center gap-1 text-label text-text-tertiary cursor-pointer hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] shrink-0"
          style={{ transition: "color 100ms" }}
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Clear all
        </button>
      )}
    </div>
  );
}
