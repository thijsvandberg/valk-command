"use client";

import { useState } from "react";
import { X, Tag, MessageSquare, MessageCircle } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { PO_STATUS_COLORS } from "@/components/sprint-board/FilterBar";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { userColor, userInitials } from "@/lib/user-display";

export interface SearchFilters {
  sections: Set<string>;
  status: Set<string>;
  poStatus: Set<string>;
  type: Set<string>;
  assignee: Set<string>;
  sprint: Set<string>;
  dateRange: string | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  sections: new Set(),
  status: new Set(),
  poStatus: new Set(),
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
  { value: "28d", label: "Last 28 days" },
  { value: "custom", label: "Custom range" },
];

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.sections.size > 0 ||
    filters.status.size > 0 ||
    filters.poStatus.size > 0 ||
    filters.type.size > 0 ||
    filters.assignee.size > 0 ||
    filters.sprint.size > 0 ||
    !!filters.dateRange
  );
}

export interface SerializedSearchFilters {
  sections: string[];
  status: string[];
  poStatus: string[];
  type: string[];
  assignee: string[];
  sprint: string[];
  dateRange: string | null;
}

export function serializeFilters(filters: SearchFilters): SerializedSearchFilters {
  return {
    sections: [...filters.sections],
    status: [...filters.status],
    poStatus: [...filters.poStatus],
    type: [...filters.type],
    assignee: [...filters.assignee],
    sprint: [...filters.sprint],
    dateRange: filters.dateRange,
  };
}

export function deserializeFilters(raw: SerializedSearchFilters): SearchFilters {
  return {
    sections: new Set(raw.sections),
    status: new Set(raw.status),
    poStatus: new Set(raw.poStatus),
    type: new Set(raw.type),
    assignee: new Set(raw.assignee),
    sprint: new Set(raw.sprint),
    dateRange: raw.dateRange,
  };
}

export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status.size > 0) params.set("status", [...filters.status].join(","));
  if (filters.poStatus.size > 0) params.set("poStatus", [...filters.poStatus].join(","));
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

function StatusDot({ status }: { status: string }) {
  const color = JIRA_STATUS_COLORS[status as keyof typeof JIRA_STATUS_COLORS]?.text ?? "#94a3b8";
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function PoStatusDot({ status }: { status: string }) {
  const color = PO_STATUS_COLORS[status]?.dot ?? "#94a3b8";
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
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
      className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-2.5"
      style={{ backgroundColor: "rgba(255,255,255,0.015)" }}
    >
      <FilterDropdown
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status}
        onChange={(next) => onChange({ ...filters, status: next })}
        labelMap={STATUS_LABEL_MAP}
        renderOption={(val) => (
          <span className="flex items-center gap-2">
            <StatusDot status={val} />
            <span>{STATUS_LABEL_MAP[val] ?? val}</span>
          </span>
        )}
        widthClass="w-48"
      />
      <FilterDropdown
        label="PO Status"
        options={filterOptions?.poStatuses ?? []}
        selected={filters.poStatus}
        onChange={(next) => onChange({ ...filters, poStatus: next })}
        searchable
        searchPlaceholder="Search PO status..."
        renderOption={(val) => (
          <span className="flex items-center gap-2">
            <PoStatusDot status={val} />
            <span>{val}</span>
          </span>
        )}
        widthClass="w-52"
      />
      <FilterDropdown
        label="Type"
        options={TYPE_OPTIONS}
        selected={filters.type}
        onChange={(next) => onChange({ ...filters, type: next })}
        labelMap={TYPE_LABEL_MAP}
        renderOption={(val) => (
          <span className="flex items-center gap-2">
            <IssueTypeIcon type={val} size={14} />
            <span>{TYPE_LABEL_MAP[val] ?? val}</span>
          </span>
        )}
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
      <div className="h-5 w-px shrink-0 bg-white/[0.10]" />

      {/* Date range single-select pills */}
      <div className="flex items-center gap-1 shrink-0">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDateRange(selectedDateOption === opt.value ? null : opt.value)}
            className="rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] whitespace-nowrap"
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

      {/* Separator between date group and section chips */}
      <div className="h-5 w-px shrink-0 bg-white/[0.10]" />

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
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] whitespace-nowrap shrink-0"
            style={{
              backgroundColor: isActive ? "rgba(74, 170, 96, 0.12)" : "rgba(255,255,255,0.03)",
              borderColor: isActive ? "rgba(74, 170, 96, 0.35)" : "rgba(255,255,255,0.07)",
              color: isActive ? "var(--color-brand-400)" : "rgba(255,255,255,0.5)",
              transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms",
            }}
          >
            {s.icon}
            {s.label}
            {count > 0 && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: isActive ? "var(--color-brand-400)" : "rgba(255,255,255,0.3)" }}
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
          className="ml-auto flex items-center gap-1 text-[11px] text-white/30 cursor-pointer hover:text-white/55 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] shrink-0"
          style={{ transition: "color 100ms" }}
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Clear all
        </button>
      )}
    </div>
  );
}
