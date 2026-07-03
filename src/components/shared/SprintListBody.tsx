"use client";

// The one shared sprint list (BRDG-362): search, sections, rows and row actions,
// container-agnostic like EpicPickerBody (BRDG-381). Renders inside the sprint
// list modal ("manage"), the single-select pickers ("select") and the move-to-
// sprint flyout ("move"). It owns search / collapse / sync-progress state and
// closes via the `onClose` prop, so the same body works in a portal modal, a
// BasePicker popover and a context-menu flyout without knowing which one holds it.

import { useState, useRef, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Pin, Check, RefreshCw, Eye, EyeOff, AlertCircle, Users, ChevronRight,
  ListFilter, Inbox, ArrowUpToLine, ArrowDownToLine, Minus,
} from "lucide-react";
import { TextInput } from "@/components/shared/TextInput";
import { Checkbox } from "@/components/shared/Checkbox";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import {
  type SprintListEntry,
  sprintDateRange, sprintStateColor, sprintStateLabel,
  filterSprintsByTeam, searchSprints, getTeamOptions, getMoveDestinations,
  getPinnedSection, getActiveFutureSection, getClosedSection, getHiddenSection,
  sortSprintsByState,
} from "@/lib/sprint-list";
import { isOverallRefinementSprint, BACKLOG_SPRINT_ID } from "@/lib/sprint-utils";

export type SprintListVariant = "manage" | "select" | "move";
export type SprintMovePosition = "top" | "bottom";

export interface SprintListBodyProps {
  sprints: SprintListEntry[];
  /** manage: full sections + pin/hide/stakeholder/sync. select: flat single-select
   *  of active & future. move: move destinations with top/bottom placement. */
  variant?: SprintListVariant;
  /** Primary row action. `position` is only set by the move variant's explicit
   *  top/bottom buttons; a plain row click leaves it undefined (caller default). */
  onSelect: (sprintId: string, sprintName: string, position?: SprintMovePosition) => void;
  onClose: () => void;
  backlogCount?: number;
  pinnedIds?: Set<string>;
  /** Pinned slot order; leads the move-destination sort. */
  pinnedOrder?: string[];
  /** Move: destinations already offered elsewhere (quick-moves, current sprint). */
  excludeSprintIds?: Set<string>;
  onPin?: (sprintId: string) => void;
  onToggleHidden?: (sprintId: string, currentlyHidden: boolean) => void;
  onStakeholder?: (sprint: SprintListEntry) => void;
  /** Manage: enables the sync footer + the search-empty sync affordance. Should
   *  throw an Error with a readable message on failure. */
  onSync?: () => Promise<void>;
  /** Multi-select (manage): checkbox rows, no icon actions, stays open on toggle. */
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (sprintId: string) => void;
  /** Select: current value (checkmark) and the optional "No sprint" row. */
  selectedId?: string | null;
  allowNone?: boolean;
  onSelectNone?: () => void;
  /** Scroll bound for the list area; containers with their own height pass a tighter one. */
  listMaxHeightClass?: string;
}

// -- Internal sub-components ----------------------------------------------------

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 pt-2 pb-0.5 text-caption font-semibold uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-tertiary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      <ChevronRight
        size={9}
        strokeWidth={2.5}
        className="shrink-0 transition-transform duration-150"
        style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
      />
      {label}
      {count !== undefined && count > 0 && (
        <span className="font-normal tabular-nums opacity-50">{count}</span>
      )}
    </button>
  );
}

function StateBadge({ state }: { state: string }) {
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-caption font-medium"
      style={{
        color: sprintStateColor(state),
        backgroundColor: `color-mix(in srgb, ${sprintStateColor(state)} 12%, transparent)`,
      }}
    >
      {sprintStateLabel(state)}
    </span>
  );
}

function TeamFilterDropdown({
  teams,
  active,
  onToggle,
}: {
  teams: string[];
  active: string | null;
  onToggle: (team: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOutsideClick(dropdownRef, () => setOpen(false), { enabled: open });

  if (teams.length <= 1) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 w-7 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          active
            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/8 text-[var(--color-brand-400)]"
            : "border-border-default bg-surface-elevated text-text-muted hover:text-text-tertiary hover:border-border-strong"
        }`}
        title={active ? `Team: ${active}` : "Filter by team"}
      >
        <span className="relative flex items-center justify-center">
          <ListFilter size={14} strokeWidth={1.5} />
          {active && (
            <span className="absolute -top-1 -right-1.5 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-surface-floating" />
          )}
        </span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-dropdown mt-1 w-28 rounded-lg border border-border-strong bg-surface-floating py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onToggle(null); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-1 text-body-sm cursor-pointer hover:bg-hover-list-item ${
              !active ? "text-text-primary font-medium" : "text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${!active ? "bg-[var(--color-brand-400)]" : "opacity-0"}`} />
            All teams
          </button>
          {teams.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onToggle(active === t ? null : t); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1 text-body-sm cursor-pointer hover:bg-hover-list-item ${
                active === t ? "text-text-primary font-medium" : "text-text-secondary"
              } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${active === t ? "bg-[var(--color-brand-400)]" : "opacity-0"}`} />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ICON_BUTTON_CLASS =
  "flex h-5 w-5 items-center justify-center rounded cursor-pointer text-text-muted hover:text-text-tertiary hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

function SprintRow({
  sprint,
  compact,
  isPinned,
  isSelected,
  showBadge,
  showHide,
  showStakeholder,
  showPin,
  showPositions,
  isChecked,
  onSelect,
  onPin,
  onHide,
  onStakeholder,
}: {
  sprint: SprintListEntry;
  compact: boolean;
  isPinned: boolean;
  isSelected: boolean;
  showBadge: boolean;
  showHide: boolean;
  showStakeholder: boolean;
  showPin: boolean;
  showPositions: boolean;
  isChecked?: boolean;
  onSelect: (position?: SprintMovePosition) => void;
  onPin?: () => void;
  onHide?: () => void;
  onStakeholder?: () => void;
}) {
  const isHidden = sprint.hidden ?? false;
  return (
    <div
      role="button"
      tabIndex={0}
      data-sprint-row
      className={`group/row flex w-full items-center justify-between rounded-md px-3 ${compact ? "py-[5px] text-body-sm" : "py-1 text-body-lg"} text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
      onClick={() => onSelect()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        {isChecked !== undefined && <Checkbox checked={isChecked} />}
        {isChecked === undefined && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: sprintStateColor(sprint.state) }}
          />
        )}
        <span className={`truncate ${isSelected ? "text-text-primary font-medium" : ""}`}>{sprint.name}</span>
        {showBadge && <StateBadge state={sprint.state} />}
        {isSelected && <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />}
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-0.5">
        {!compact && (
          <span className="mr-0.5 text-body-sm tabular-nums text-text-muted">
            {sprintDateRange(sprint)}
          </span>
        )}
        {showPositions && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect("top"); }}
              className={`${ICON_BUTTON_CLASS} opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100`}
              title="Move to top of sprint"
            >
              <ArrowUpToLine className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect("bottom"); }}
              className={`${ICON_BUTTON_CLASS} opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100`}
              title="Move to bottom of sprint"
            >
              <ArrowDownToLine className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </>
        )}
        {showStakeholder && onStakeholder && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStakeholder(); }}
            className={ICON_BUTTON_CLASS}
            title="View stakeholder"
          >
            <Users className="h-3 w-3" strokeWidth={1.5} />
          </button>
        )}
        {showHide && onHide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            className={ICON_BUTTON_CLASS}
            title={isHidden ? "Unhide sprint" : "Hide sprint"}
          >
            {isHidden
              ? <EyeOff className="h-3 w-3" strokeWidth={1.5} />
              : <Eye className="h-3 w-3" strokeWidth={1.5} />}
          </button>
        )}
        {showPin && onPin && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={`flex h-5 w-5 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isPinned
                ? "text-[var(--color-brand-400)]"
                : "text-text-muted hover:text-text-tertiary hover:bg-hover-list-item"
            }`}
            title={isPinned ? "Unpin from tabs" : "Pin to tab"}
          >
            <Pin className="h-3 w-3" strokeWidth={1.5} fill={isPinned ? "currentColor" : "none"} />
          </button>
        )}
      </span>
    </div>
  );
}

// -- Main component ---------------------------------------------------------------

export function SprintListBody({
  sprints,
  variant = "manage",
  onSelect,
  onClose,
  backlogCount = 0,
  pinnedIds,
  pinnedOrder,
  excludeSprintIds,
  onPin,
  onToggleHidden,
  onStakeholder,
  onSync,
  multiSelect,
  selectedIds,
  onToggleSelect,
  selectedId,
  allowNone,
  onSelectNone,
  listMaxHeightClass = "max-h-80",
}: SprintListBodyProps) {
  const [search, setSearch] = useState("");
  const [storedTeamFilter, setTeamFilter] = useLocalStorage<string | null>("sprint-list-team-filter", null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [activeFutureCollapsed, setActiveFutureCollapsed] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isManage = variant === "manage";
  const isMove = variant === "move";
  const teamFilter = isManage ? storedTeamFilter : null;
  const effectivePinned = useMemo(() => pinnedIds ?? new Set<string>(), [pinnedIds]);
  const isSearching = search.length > 0;
  const teamOptions = useMemo(() => (isManage ? getTeamOptions(sprints) : []), [sprints, isManage]);

  // Manage sections (team filter applied)
  const pinnedSection = useMemo(() => (isManage ? filterSprintsByTeam(getPinnedSection(sprints, effectivePinned), teamFilter) : []), [isManage, sprints, effectivePinned, teamFilter]);
  const activeFutureSection = useMemo(() => (isManage ? filterSprintsByTeam(getActiveFutureSection(sprints, effectivePinned), teamFilter) : []), [isManage, sprints, effectivePinned, teamFilter]);
  const closedSection = useMemo(() => (isManage ? filterSprintsByTeam(getClosedSection(sprints, effectivePinned), teamFilter) : []), [isManage, sprints, effectivePinned, teamFilter]);
  const hiddenSection = useMemo(() => (isManage ? filterSprintsByTeam(getHiddenSection(sprints), teamFilter) : []), [isManage, sprints, teamFilter]);

  // Manage search mode: flat, cross-section results
  const searchResults = useMemo(
    () => (isManage && isSearching ? filterSprintsByTeam(searchSprints(sprints, search), teamFilter) : []),
    [isManage, sprints, search, isSearching, teamFilter],
  );

  // Select: active & future, flat
  const selectList = useMemo(() => {
    if (variant !== "select") return [];
    const available = sortSprintsByState(sprints.filter((s) => !s.hidden && (s.state === "active" || s.state === "future")));
    return isSearching ? available.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : available;
  }, [variant, sprints, isSearching, search]);

  // Move: destinations + the two generic buckets on top (BRDG-374)
  const overallRefinement = useMemo(
    () => (isMove ? sprints.find((s) => isOverallRefinementSprint(s.name)) ?? null : null),
    [isMove, sprints],
  );
  const moveList = useMemo(() => {
    if (!isMove) return [];
    const destinations = getMoveDestinations(sprints, excludeSprintIds, pinnedOrder ?? []);
    return isSearching ? destinations.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : destinations;
  }, [isMove, sprints, excludeSprintIds, pinnedOrder, isSearching, search]);
  const matchesQuery = useCallback(
    (name: string) => !isSearching || name.toLowerCase().includes(search.toLowerCase()),
    [isSearching, search],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSyncDone(false);
  }, []);

  const handleSync = useCallback(async () => {
    if (!onSync) return;
    setSyncing(true);
    setSyncError(null);
    setSyncDone(false);
    try {
      await onSync();
      setSyncDone(true);
    } catch (err) {
      setSyncError(err instanceof Error && err.message ? err.message : "Network error");
    } finally {
      setSyncing(false);
    }
  }, [onSync]);

  const selectSprint = useCallback((sprint: SprintListEntry, position?: SprintMovePosition) => {
    const id = String(sprint.id);
    if (multiSelect && onToggleSelect) {
      onToggleSelect(id);
      return;
    }
    onSelect(id, sprint.name, position);
    onClose();
  }, [multiSelect, onToggleSelect, onSelect, onClose]);

  // Arrow keys walk the rows (roving focus); Escape closes the container.
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-sprint-row]") ?? []);
    if (rows.length === 0) return;
    e.preventDefault();
    const target = e.target as HTMLElement;
    const current = rows.indexOf(target);
    const next = current === -1
      ? rows[0]
      : rows[Math.min(Math.max(current + (e.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1)];
    next.focus();
  }, [onClose]);

  function renderRow(sprint: SprintListEntry, options: { showBadge: boolean; showHide: boolean; showStakeholder: boolean }) {
    const id = String(sprint.id);
    return (
      <SprintRow
        key={id}
        sprint={sprint}
        compact={!isManage}
        isPinned={effectivePinned.has(id)}
        isSelected={selectedId != null && selectedId === id}
        isChecked={multiSelect && selectedIds ? selectedIds.has(id) : undefined}
        showBadge={options.showBadge}
        showHide={isManage && !multiSelect && options.showHide && Boolean(onToggleHidden)}
        showStakeholder={isManage && !multiSelect && options.showStakeholder && Boolean(onStakeholder)}
        showPin={isManage && !multiSelect && Boolean(onPin)}
        showPositions={isMove}
        onSelect={(position) => selectSprint(sprint, position)}
        onPin={onPin ? () => onPin(id) : undefined}
        onHide={onToggleHidden ? () => onToggleHidden(id, sprint.hidden ?? false) : undefined}
        onStakeholder={onStakeholder ? () => onStakeholder(sprint) : undefined}
      />
    );
  }

  const hasDefaultContent = pinnedSection.length > 0 || activeFutureSection.length > 0 || closedSection.length > 0;

  const syncAffordance = onSync ? (
    syncError ? (
      <div className="mt-2 flex items-start justify-center gap-2 text-body-sm text-red-400">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
        <span>
          {syncError}{" "}
          <button type="button" onClick={handleSync} className="cursor-pointer text-red-300 underline underline-offset-2 hover:text-red-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">Retry</button>
        </span>
      </div>
    ) : (
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="mt-2 inline-flex items-center gap-1 text-body-sm text-text-muted cursor-pointer hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        {syncing ? "Syncing..." : "Sync from Jira"}
      </button>
    )
  ) : null;

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Search + team filter */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
        <div className="min-w-0 flex-1">
          <TextInput
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search sprints..."
            inputSize="sm"
            autoFocus
          />
        </div>
        {isManage && <TeamFilterDropdown teams={teamOptions} active={teamFilter} onToggle={setTeamFilter} />}
      </div>

      {/* List */}
      <div className={`${listMaxHeightClass} overflow-y-auto px-1.5 pb-1`}>
        {variant === "select" && (
          <>
            {allowNone && !isSearching && (
              <div
                role="button"
                tabIndex={0}
                data-sprint-row
                className="flex w-full items-center gap-2 rounded-md px-3 py-[5px] text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                onClick={() => { onSelectNone?.(); onClose(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectNone?.();
                    onClose();
                  }
                }}
              >
                <Minus size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                <span className={selectedId == null ? "text-text-primary font-medium" : ""}>No sprint</span>
              </div>
            )}
            {selectList.map((s) => renderRow(s, { showBadge: s.state === "active", showHide: false, showStakeholder: false }))}
            {selectList.length === 0 && (
              <div className="px-3 py-3 text-center text-body-sm text-text-muted">
                {isSearching ? "No sprints found" : "No sprints available"}
              </div>
            )}
          </>
        )}

        {isMove && (
          <>
            {matchesQuery("Backlog") && (
              <div
                role="button"
                tabIndex={0}
                data-sprint-row
                className="flex w-full items-center gap-2 rounded-md px-3 py-[5px] text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                onClick={() => { onSelect(BACKLOG_SPRINT_ID, "Backlog"); onClose(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(BACKLOG_SPRINT_ID, "Backlog");
                    onClose();
                  }
                }}
              >
                <Inbox className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
                <span>Backlog</span>
              </div>
            )}
            {overallRefinement && matchesQuery(overallRefinement.name) && (
              renderRow(overallRefinement, { showBadge: false, showHide: false, showStakeholder: false })
            )}
            {(matchesQuery("Backlog") || (overallRefinement && matchesQuery(overallRefinement.name))) && moveList.length > 0 && (
              <div className="mx-2 my-0.5 h-px bg-overlay-strong" />
            )}
            {moveList.map((s) => renderRow(s, { showBadge: false, showHide: false, showStakeholder: false }))}
            {moveList.length === 0 && !matchesQuery("Backlog") && !(overallRefinement && matchesQuery(overallRefinement.name)) && (
              <div className="px-3 py-2 text-body-sm text-text-tertiary">
                {isSearching ? "No sprints found" : "No sprints available"}
              </div>
            )}
          </>
        )}

        {isManage && (isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map((s) =>
              renderRow(s, {
                showBadge: true,
                showHide: !effectivePinned.has(String(s.id)),
                showStakeholder: !(s.hidden ?? false),
              }),
            )
          ) : (
            <div className="px-3 py-5 text-center">
              {syncDone ? (
                <p className="text-body-sm text-text-muted">
                  No sprints found in Jira either.
                </p>
              ) : (
                <>
                  <p className="text-body-sm text-text-muted">
                    No sprints match &ldquo;{search}&rdquo;
                  </p>
                  {syncAffordance}
                </>
              )}
            </div>
          )
        ) : (
          <>
            {!hasDefaultContent && sprints.length === 0 && (
              <div className="px-3 py-5 text-center text-body-sm text-text-muted">
                No sprints cached. Sync from Jira to load.
              </div>
            )}

            {!hasDefaultContent && sprints.length > 0 && teamFilter && (
              <div className="px-3 py-5 text-center text-body-sm text-text-muted">
                No sprints for team {teamFilter}.
              </div>
            )}

            {pinnedSection.length > 0 && (
              <>
                <SectionHeader label="Pinned" count={pinnedSection.length} collapsed={pinnedCollapsed} onToggle={() => setPinnedCollapsed((v) => !v)} />
                {!pinnedCollapsed && pinnedSection.map((s) => renderRow(s, { showBadge: true, showHide: false, showStakeholder: true }))}
              </>
            )}

            {activeFutureSection.length > 0 && (
              <>
                <SectionHeader label="Active & Future" count={activeFutureSection.length} collapsed={activeFutureCollapsed} onToggle={() => setActiveFutureCollapsed((v) => !v)} />
                {!activeFutureCollapsed && activeFutureSection.map((s) => renderRow(s, { showBadge: false, showHide: true, showStakeholder: true }))}
              </>
            )}

            {/* Backlog entry */}
            {!teamFilter && !multiSelect && (
              <div className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-body-lg text-text-secondary hover:bg-overlay-default hover:text-text-primary">
                <button
                  type="button"
                  data-sprint-row
                  className="flex items-center gap-2 min-w-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  onClick={() => { onSelect(BACKLOG_SPRINT_ID, "Backlog"); onClose(); }}
                >
                  <Inbox className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
                  <span>Backlog</span>
                  {backlogCount > 0 && (
                    <span className="rounded-full bg-overlay-default px-1.5 py-0.5 text-caption font-medium leading-none text-text-muted">
                      {backlogCount}
                    </span>
                  )}
                </button>
                {onPin && (
                  <button
                    type="button"
                    onClick={() => onPin(BACKLOG_SPRINT_ID)}
                    className={`flex h-5 w-5 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                      effectivePinned.has(BACKLOG_SPRINT_ID)
                        ? "text-[var(--color-brand-400)]"
                        : "text-text-muted hover:text-text-tertiary hover:bg-hover-list-item"
                    }`}
                    title={effectivePinned.has(BACKLOG_SPRINT_ID) ? "Unpin from tabs" : "Pin to tab"}
                  >
                    <Pin className="h-3 w-3" strokeWidth={1.5} fill={effectivePinned.has(BACKLOG_SPRINT_ID) ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            )}

            {closedSection.length > 0 && (
              <>
                <SectionHeader label="Closed" count={closedSection.length} collapsed={!closedExpanded} onToggle={() => setClosedExpanded((v) => !v)} />
                {closedExpanded && closedSection.map((s) => renderRow(s, { showBadge: false, showHide: true, showStakeholder: true }))}
              </>
            )}

            {hiddenSection.length > 0 && (
              <>
                <SectionHeader label="Hidden" count={hiddenSection.length} collapsed={!hiddenExpanded} onToggle={() => setHiddenExpanded((v) => !v)} />
                {hiddenExpanded && hiddenSection.map((s) => renderRow(s, { showBadge: true, showHide: true, showStakeholder: false }))}
              </>
            )}
          </>
        ))}
      </div>

      {/* Footer: subtle sync link (manage only) */}
      {isManage && onSync && !isSearching && (
        <div className="flex items-center justify-center border-t border-border-default px-3 py-1.5">
          {syncError ? (
            <span className="flex items-center gap-1.5 text-label text-red-400">
              <AlertCircle size={11} strokeWidth={1.5} />
              Sync failed
              <button type="button" onClick={handleSync} className="cursor-pointer underline underline-offset-2 hover:text-red-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]">retry</button>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-label text-text-muted cursor-pointer hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              {syncDone ? (
                <>
                  <Check size={11} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                  <span className="text-[var(--color-brand-400)]">Synced</span>
                </>
              ) : (
                <>
                  <RefreshCw size={11} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing..." : "Sync sprints"}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
