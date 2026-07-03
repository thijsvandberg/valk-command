"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ListFilter, Eye, Search, X } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { userInitials, userColor, type AssignableUser } from "@/components/shared/AssigneePicker";
import { swrFetcher } from "@/lib/api-client";
import { Checkbox } from "@/components/shared/Checkbox";
import { StatusOption } from "@/components/shared/StatusOption";
import { ReadinessOption } from "@/components/shared/ReadinessOption";
import { IssueTypeOption } from "@/components/shared/IssueTypeOption";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { BoardFieldList } from "@/components/sprint-board/BoardFieldToggle";
import {
  EDIT_STATE_OPTIONS,
  GAPS_OPTIONS,
  READINESS_OPTIONS,
  SPRINT_STATE_FILTER_OPTIONS,
  type InlineTagId,
} from "@/components/sprint-board/filter-bar-types";

// A single filter category fed into the two-pane panel. Each carries the verbatim
// option renderer from the old FilterBar so the badges stay identical (BRDG-344).
interface FilterCategory {
  key: string;
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  renderOption: (value: string) => React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Map option values to display labels (used for search matching and the rail label). */
  labelMap?: Record<string, string>;
  /** Special meta-options shown above the regular list (e.g. sprint-state buckets). */
  leadingOptions?: { value: string; label: string; dot?: string }[];
  leadingLabel?: string;
}

export interface FilterControlsPanelProps {
  statusFilter: Set<string>;
  epicFilter: Set<string>;
  assigneeFilter: Set<string>;
  creatorFilter?: Set<string>;
  readinessFilter: Set<string>;
  editStateFilter: Set<string>;
  issueTypeFilter: Set<string>;
  gapsFilter?: Set<string>;
  teamFilter?: Set<string>;
  sprintFilter?: Set<string>;
  onStatusFilterChange: (next: Set<string>) => void;
  onEpicFilterChange: (next: Set<string>) => void;
  onAssigneeFilterChange: (next: Set<string>) => void;
  onCreatorFilterChange?: (next: Set<string>) => void;
  onReadinessFilterChange: (next: Set<string>) => void;
  onEditStateFilterChange: (next: Set<string>) => void;
  onIssueTypeFilterChange: (next: Set<string>) => void;
  onGapsFilterChange?: (next: Set<string>) => void;
  onTeamFilterChange?: (next: Set<string>) => void;
  onSprintFilterChange?: (next: Set<string>) => void;
  statusOptions: string[];
  epicOptions: string[];
  assigneeOptions: string[];
  // Token (accountId or name) -> display name for the assignee options (BRDG-365).
  // Optional: surfaces (e.g. the inbox) whose assignee options are still names
  // omit it and the token doubles as the label.
  assigneeLabelMap?: Record<string, string>;
  creatorOptions?: string[];
  /** Token -> display name for the creator (reporter) options; omit to use the token as label. */
  creatorLabelMap?: Record<string, string>;
  issueTypeOptions: string[];
  teamOptions?: string[];
  sprintOptions?: string[];
  sprintNameMap?: Record<string, string>;
  /** Clears the filter sets only (not field visibility). */
  onClearAll: () => void;
  /** Field-visibility (Display view) state. */
  columnVisible: Set<InlineTagId>;
  onColumnToggle: (id: InlineTagId, show: boolean) => void;
  onColumnReset: () => void;
  /** Fields not toggleable in the current context (per-sprint fields on the All view). */
  columnDisabledIds?: Set<InlineTagId>;
  columnDisabledTitle?: string;
  /**
   * Restrict the filter categories to this set of keys, in order (BRDG-357). The
   * New story inbox passes a subset (no Readiness/Changes/Gaps). Omitted on the
   * board, which keeps the full, unfiltered category list.
   */
  categoryWhitelist?: string[];
  /**
   * Hide the Sprint category's "By state" (active/future/closed) leading options
   * (BRDG-357). The inbox filters sprints by display name, with no sprint-state
   * data, so the state buckets would be inert.
   */
  hideSprintStateOptions?: boolean;
}

function ChangesDot({ value }: { value: string }) {
  const cfg = EDIT_STATE_OPTIONS.find((o) => o.value === value);
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg?.dotClass ?? ""}`} />
      {cfg?.label ?? value}
    </span>
  );
}

function GapsDot({ value }: { value: string }) {
  const cfg = GAPS_OPTIONS.find((o) => o.value === value);
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg?.dotClass ?? ""}`} />
      {cfg?.label ?? value}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-caption font-semibold"
      style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
    >
      {n}
    </span>
  );
}

export function FilterControlsPanel(props: FilterControlsPanelProps) {
  const [activeKey, setActiveKey] = useState("status");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"filters" | "display">("filters");

  const readinessOptions = useMemo(
    () => [...READINESS_OPTIONS.filter((o) => o.value !== null).map((o) => o.value as string), "none"],
    [],
  );

  // Favourite assignees float to the top, mirroring the AssigneePicker ordering.
  const { data: assignableData } = useSWR<{ users: AssignableUser[] }>(
    "/api/jira/assignable-users",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
  const orderedAssigneeOptions = useMemo(() => {
    // Favourite tokens (BRDG-365): the options are accountId tokens (name
    // fallback), so favourites are matched by id where captured.
    const favoriteTokens = new Set<string>();
    for (const u of assignableData?.users ?? []) if (u.isFavorite) favoriteTokens.add(u.accountId ?? u.displayName);
    const favs = props.assigneeOptions.filter((t) => favoriteTokens.has(t));
    const rest = props.assigneeOptions.filter((t) => !favoriteTokens.has(t));
    return [...favs, ...rest];
  }, [props.assigneeOptions, assignableData]);

  const editStateValues = useMemo(() => EDIT_STATE_OPTIONS.map((o) => o.value), []);

  const categories = useMemo<FilterCategory[]>(() => {
    const list: FilterCategory[] = [
      {
        key: "status",
        label: "Status",
        options: props.statusOptions,
        selected: props.statusFilter,
        onChange: props.onStatusFilterChange,
        renderOption: (v) => <StatusOption value={v} />,
      },
      {
        key: "epic",
        label: "Epic",
        options: props.epicOptions,
        selected: props.epicFilter,
        onChange: props.onEpicFilterChange,
        searchable: true,
        searchPlaceholder: "Search epics...",
        renderOption: (v) => <EpicBadge epic={v} className="max-w-[240px]" />,
      },
      {
        key: "assignee",
        label: "Assignee",
        options: orderedAssigneeOptions,
        selected: props.assigneeFilter,
        onChange: props.onAssigneeFilterChange,
        searchable: true,
        searchPlaceholder: "Search assignees...",
        labelMap: props.assigneeLabelMap,
        renderOption: (token) => {
          const name = props.assigneeLabelMap?.[token] ?? token;
          return (
            <span className="flex items-center gap-2">
              <Avatar assignee={{ name, initials: userInitials(name), color: userColor(name) }} size={20} />
              <span className="truncate">{name}</span>
            </span>
          );
        },
      },
      {
        key: "readiness",
        label: "Readiness",
        options: readinessOptions,
        selected: props.readinessFilter,
        onChange: props.onReadinessFilterChange,
        renderOption: (v) => <ReadinessOption value={v} />,
      },
      {
        key: "changes",
        label: "Changes",
        options: editStateValues,
        selected: props.editStateFilter,
        onChange: props.onEditStateFilterChange,
        renderOption: (v) => <ChangesDot value={v} />,
      },
      {
        key: "type",
        label: "Type",
        options: props.issueTypeOptions,
        selected: props.issueTypeFilter,
        onChange: props.onIssueTypeFilterChange,
        renderOption: (v) => <IssueTypeOption value={v} />,
      },
    ];

    if (props.gapsFilter && props.onGapsFilterChange) {
      list.push({
        key: "gaps",
        label: "Gaps",
        options: GAPS_OPTIONS.map((o) => o.value),
        selected: props.gapsFilter,
        onChange: props.onGapsFilterChange,
        renderOption: (v) => <GapsDot value={v} />,
      });
    }
    if (props.teamFilter && props.onTeamFilterChange && props.teamOptions && props.teamOptions.length > 0) {
      list.push({
        key: "team",
        label: "Team",
        options: props.teamOptions,
        selected: props.teamFilter,
        onChange: props.onTeamFilterChange,
        renderOption: (v) => <span>{v}</span>,
      });
    }
    if (props.sprintFilter && props.onSprintFilterChange && props.sprintOptions && props.sprintNameMap) {
      const nameMap = props.sprintNameMap;
      list.push({
        key: "sprint",
        label: "Sprint",
        options: props.sprintOptions,
        selected: props.sprintFilter,
        onChange: props.onSprintFilterChange,
        searchable: true,
        searchPlaceholder: "Search sprints...",
        labelMap: nameMap,
        leadingOptions: props.hideSprintStateOptions
          ? undefined
          : SPRINT_STATE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label, dot: o.dot })),
        leadingLabel: props.hideSprintStateOptions ? undefined : "By state",
        renderOption: (id) => <span>{nameMap[id] ?? id}</span>,
      });
    }
    if (props.creatorFilter && props.onCreatorFilterChange && props.creatorOptions) {
      list.push({
        key: "creator",
        label: "Reporter",
        options: props.creatorOptions,
        selected: props.creatorFilter,
        onChange: props.onCreatorFilterChange,
        searchable: true,
        searchPlaceholder: "Search reporters...",
        labelMap: props.creatorLabelMap,
        renderOption: (token) => {
          const name = props.creatorLabelMap?.[token] ?? token;
          return (
            <span className="flex items-center gap-2">
              <Avatar assignee={{ name, initials: userInitials(name), color: userColor(name) }} size={20} />
              <span className="truncate">{name}</span>
            </span>
          );
        },
      });
    }
    if (props.categoryWhitelist) {
      const allowed = props.categoryWhitelist;
      return list
        .filter((c) => allowed.includes(c.key))
        .sort((a, b) => allowed.indexOf(a.key) - allowed.indexOf(b.key));
    }
    return list;
  }, [props, orderedAssigneeOptions, readinessOptions, editStateValues]);

  const active = categories.find((c) => c.key === activeKey) ?? categories[0];
  const total = categories.reduce((n, c) => n + c.selected.size, 0);

  const filteredOptions = useMemo(() => {
    if (!active.searchable || !search.trim()) return active.options;
    const q = search.toLowerCase();
    return active.options.filter((opt) => (active.labelMap?.[opt] ?? opt).toLowerCase().includes(q));
  }, [active, search]);

  function toggleOption(category: FilterCategory, value: string) {
    const next = new Set(category.selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    category.onChange(next);
  }

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[548px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border-strong bg-surface-floating shadow-xl">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />

      {/* Header: title + Display toggle + contextual Clear/Reset */}
      <div className="flex items-center justify-between border-b border-border-default px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
          {view === "display" ? (
            <>
              <Eye className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />
              Display
            </>
          ) : (
            <>
              <ListFilter className="h-4 w-4 text-[var(--color-brand-500)]" strokeWidth={1.75} />
              Filters
              {total > 0 && <CountBadge n={total} />}
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setView((v) => (v === "display" ? "filters" : "display"))}
            className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-caption font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              view === "display"
                ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-600)]"
                : "text-text-tertiary ring-1 ring-border-default hover:bg-hover-interactive hover:text-text-secondary"
            }`}
            style={{ transition: "background-color 120ms, color 120ms" }}
            title="Display settings"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            Display
          </button>
          {view === "display" ? (
            <button
              type="button"
              onClick={props.onColumnReset}
              className="text-caption font-medium text-text-tertiary cursor-pointer hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 120ms" }}
            >
              Reset
            </button>
          ) : (
            <button
              type="button"
              onClick={props.onClearAll}
              disabled={total === 0}
              className="text-caption font-medium text-text-tertiary cursor-pointer enabled:hover:text-text-primary disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 120ms" }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {view === "display" ? (
        <BoardFieldList
          visible={props.columnVisible}
          onChange={props.onColumnToggle}
          onReset={props.onColumnReset}
          disabledIds={props.columnDisabledIds}
          disabledTitle={props.columnDisabledTitle}
        />
      ) : (
        <div className="flex h-[306px]">
          {/* Category rail */}
          <div className="w-[186px] shrink-0 overflow-y-auto border-r border-border-default p-1.5">
            {categories.map((c) => {
              const count = c.selected.size;
              const isActive = c.key === active.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setActiveKey(c.key); setSearch(""); }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-body-sm cursor-pointer hover:bg-hover-list-item ${
                    isActive ? "bg-overlay-default font-medium text-text-primary" : "text-text-secondary"
                  } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                  style={{ transition: "background-color 120ms, color 120ms" }}
                >
                  <span className="flex items-center gap-2">
                    {count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
                    {c.label}
                  </span>
                  {count > 0 && <CountBadge n={count} />}
                </button>
              );
            })}
          </div>

          {/* Options pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            {active.searchable && (
              <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={active.searchPlaceholder ?? "Search..."}
                  className="min-w-0 flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="grid h-4 w-4 place-items-center rounded-full text-text-muted cursor-pointer hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
              {/* Leading meta-options (e.g. sprint-state buckets), hidden while searching. */}
              {active.leadingOptions && active.leadingOptions.length > 0 && !search.trim() && (
                <div className="mb-1 border-b border-border-default pb-1">
                  {active.leadingLabel && (
                    <div className="px-2 pb-1 pt-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                      {active.leadingLabel}
                    </div>
                  )}
                  {active.leadingOptions.map((opt) => {
                    const on = active.selected.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleOption(active, opt.value)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-body-sm cursor-pointer hover:bg-hover-list-item ${
                          on ? "text-text-primary" : "text-text-secondary"
                        } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                      >
                        <Checkbox checked={on} />
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.dot ?? "var(--color-status-neutral)" }} />
                        <span className="font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-6 text-center text-body-sm text-text-muted">No matches</p>
              ) : (
                filteredOptions.map((opt) => {
                  const on = active.selected.has(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleOption(active, opt)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-body-sm cursor-pointer hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <Checkbox checked={on} />
                      {active.renderOption(opt)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
