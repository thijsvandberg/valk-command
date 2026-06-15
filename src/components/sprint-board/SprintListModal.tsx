"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Pin, Check, RefreshCw, Eye, EyeOff, AlertCircle, Users, ChevronRight, ListFilter, Inbox } from "lucide-react";
import { TextInput } from "@/components/shared/TextInput";
import { Checkbox } from "@/components/shared/Checkbox";
import { apiFetch, ApiError } from "@/lib/api-client";
import { extractTeamPrefix } from "@/lib/sprint-utils";

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  hidden?: boolean;
}

// -- Utilities ----------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function dateRange(sprint: JiraSprint): string {
  const start = formatDate(sprint.startDate);
  const end = formatDate(sprint.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  return "";
}

function stateColor(state: string): string {
  if (state === "active") return "var(--color-status-success)";
  if (state === "future") return "var(--color-status-info)";
  return "var(--color-text-muted)";
}

function stateLabel(state: string): string {
  if (state === "active") return "Active";
  if (state === "future") return "Future";
  return "Closed";
}

// -- Section derivation -------------------------------------------------------

const STATE_ORDER: Record<string, number> = { active: 0, future: 1, closed: 2 };

function sortByState(list: JiraSprint[]): JiraSprint[] {
  return [...list].sort((a, b) => {
    const ao = STATE_ORDER[a.state] ?? 3;
    const bo = STATE_ORDER[b.state] ?? 3;
    if (ao !== bo) return ao - bo;
    if (a.state === "active" && b.state === "active") {
      return (a.startDate ? new Date(a.startDate).getTime() : 0) -
             (b.startDate ? new Date(b.startDate).getTime() : 0);
    }
    return a.name.localeCompare(b.name);
  });
}

function sortByEndDateDesc(list: JiraSprint[]): JiraSprint[] {
  return [...list].sort((a, b) => {
    return (b.endDate ? new Date(b.endDate).getTime() : 0) -
           (a.endDate ? new Date(a.endDate).getTime() : 0);
  });
}

function filterByTeam(list: JiraSprint[], team: string | null): JiraSprint[] {
  if (!team) return list;
  return list.filter((s) => extractTeamPrefix(s.name) === team);
}

function getPinnedSection(sprints: JiraSprint[], pinnedIds: Set<string>): JiraSprint[] {
  return sortByState(sprints.filter((s) => pinnedIds.has(String(s.id))));
}

function getActiveFutureSection(sprints: JiraSprint[], pinnedIds: Set<string>): JiraSprint[] {
  return sortByState(
    sprints.filter((s) => !s.hidden && (s.state === "active" || s.state === "future") && !pinnedIds.has(String(s.id))),
  );
}

function getRecentClosedSection(sprints: JiraSprint[], pinnedIds: Set<string>, limit = 5): JiraSprint[] {
  return sortByEndDateDesc(
    sprints.filter((s) => !s.hidden && s.state === "closed" && !pinnedIds.has(String(s.id))),
  ).slice(0, limit);
}

function getHiddenSprints(sprints: JiraSprint[]): JiraSprint[] {
  return sortByState(sprints.filter((s) => s.hidden));
}

function getSearchResults(sprints: JiraSprint[], query: string): JiraSprint[] {
  const q = query.toLowerCase();
  return sortByState(sprints.filter((s) => s.name.toLowerCase().includes(q)));
}

function getTeamOptions(sprints: JiraSprint[]): string[] {
  const teams = new Set<string>();
  for (const s of sprints) {
    if (s.hidden) continue;
    const t = extractTeamPrefix(s.name);
    if (t) teams.add(t);
  }
  return [...teams].sort();
}

// -- Sub-components -----------------------------------------------------------

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
      className="flex w-full items-center gap-1.5 px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-tertiary"
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
        color: stateColor(state),
        backgroundColor: `color-mix(in srgb, ${stateColor(state)} 12%, transparent)`,
      }}
    >
      {stateLabel(state)}
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
            : "border-border-default bg-[var(--color-surface-elevated)] text-text-muted hover:text-text-tertiary hover:border-border-strong"
        }`}
        title={active ? `Team: ${active}` : "Filter by team"}
      >
        <span className="relative flex items-center justify-center">
          <ListFilter size={14} strokeWidth={1.5} />
          {active && (
            <span className="absolute -top-1 -right-1.5 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-floating)]" />
          )}
        </span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-28 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
          <button
            type="button"
            onClick={() => { onToggle(null); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-1 text-body-sm cursor-pointer hover:bg-hover-list-item ${
              !active ? "text-text-primary font-medium" : "text-text-secondary"
            }`}
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
              }`}
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

function SprintRow({
  sprint,
  isPinned,
  showBadge,
  showHide,
  showStakeholder,
  showPin = true,
  isChecked,
  onSelect,
  onPin,
  onHide,
  onStakeholder,
}: {
  sprint: JiraSprint;
  isPinned: boolean;
  showBadge: boolean;
  showHide: boolean;
  showStakeholder: boolean;
  showPin?: boolean;
  isChecked?: boolean;
  onSelect: () => void;
  onPin: () => void;
  onHide: () => void;
  onStakeholder: () => void;
}) {
  const isHidden = sprint.hidden ?? false;
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full items-center justify-between rounded-md px-3 py-1 text-body-lg text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      onClick={onSelect}
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
            style={{ backgroundColor: stateColor(sprint.state) }}
          />
        )}
        <span className="truncate">{sprint.name}</span>
        {showBadge && <StateBadge state={sprint.state} />}
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-0.5">
        <span className="mr-0.5 text-body-sm tabular-nums text-text-muted">
          {dateRange(sprint)}
        </span>
        {showStakeholder && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStakeholder(); }}
            className="flex h-5 w-5 items-center justify-center rounded cursor-pointer text-text-muted hover:text-text-tertiary hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="View stakeholder"
          >
            <Users className="h-3 w-3" strokeWidth={1.5} />
          </button>
        )}
        {showHide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            className="flex h-5 w-5 items-center justify-center rounded cursor-pointer text-text-muted hover:text-text-tertiary hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title={isHidden ? "Unhide sprint" : "Hide sprint"}
          >
            {isHidden
              ? <EyeOff className="h-3 w-3" strokeWidth={1.5} />
              : <Eye className="h-3 w-3" strokeWidth={1.5} />}
          </button>
        )}
        {showPin && (
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

// -- Main component -----------------------------------------------------------

export function SprintListModal({
  onClose,
  onSelect,
  onPin,
  pinnedIds,
  alignLeft,
  portalAnchor,
  multiSelect,
  selectedIds,
  onToggleSelect,
}: {
  onClose: () => void;
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
  alignLeft?: boolean;
  portalAnchor?: { top: number; left?: number; right?: number };
  /** Multi-select mode: show checkboxes, stay open on toggle */
  multiSelect?: boolean;
  /** Currently selected sprint IDs (multi-select mode) */
  selectedIds?: Set<string>;
  /** Toggle a sprint in/out of selection (multi-select mode) */
  onToggleSelect?: (sprintId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useLocalStorage<string | null>("sprint-list-team-filter", null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [activeFutureCollapsed, setActiveFutureCollapsed] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { sprints, backlogCount, mutate } = useJiraSprints();

  const allSprints = useMemo(() => sprints ?? [], [sprints]);
  const isSearching = search.length > 0;
  const teamOptions = useMemo(() => getTeamOptions(allSprints), [allSprints]);

  // Sections for default mode (team filter applied)
  const pinnedSection = useMemo(() => filterByTeam(getPinnedSection(allSprints, pinnedIds), teamFilter), [allSprints, pinnedIds, teamFilter]);
  const activeFutureSection = useMemo(() => filterByTeam(getActiveFutureSection(allSprints, pinnedIds), teamFilter), [allSprints, pinnedIds, teamFilter]);
  const recentClosedSection = useMemo(() => filterByTeam(getRecentClosedSection(allSprints, pinnedIds), teamFilter), [allSprints, pinnedIds, teamFilter]);
  const hiddenSection = useMemo(() => filterByTeam(getHiddenSprints(allSprints), teamFilter), [allSprints, teamFilter]);

  // Flat results for search mode (team filter applied)
  const searchResults = useMemo(
    () => isSearching ? filterByTeam(getSearchResults(allSprints, search), teamFilter) : [],
    [allSprints, search, isSearching, teamFilter],
  );

  useEffect(() => { setSyncDone(false); }, [search]);

  useOutsideClick(ref, onClose);

  const handleToggleHidden = useCallback(async (sprintId: number, currentlyHidden: boolean) => {
    const currentHiddenIds = allSprints.filter((s) => s.hidden).map((s) => s.id);
    let newHiddenIds: number[];
    if (currentlyHidden) {
      newHiddenIds = currentHiddenIds.filter((id) => id !== sprintId);
    } else {
      newHiddenIds = [...currentHiddenIds, sprintId];
      if (pinnedIds.has(String(sprintId))) onPin(String(sprintId));
    }
    await apiFetch("/api/jira/sprints", { method: "PUT", body: { hiddenIds: newHiddenIds } });
    await mutate();
  }, [allSprints, pinnedIds, onPin, mutate]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncDone(false);
    try {
      await Promise.all([
        apiFetch("/api/jira/sync-sprints?scope=sprints", { method: "POST" }),
        apiFetch("/api/jira/sync-sprints?scope=history", { method: "POST" }),
        new Promise((r) => setTimeout(r, 600)),
      ]);
      await mutate();
      setSyncDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setSyncError(err.body?.error || `Sync failed (${err.status})`);
      } else {
        setSyncError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setSyncing(false);
    }
  }, [mutate]);

  const selectSprint = useCallback((sprint: JiraSprint) => {
    if (multiSelect && onToggleSelect) {
      onToggleSelect(String(sprint.id));
      return;
    }
    onSelect(String(sprint.id), sprint.name);
    onClose();
  }, [onSelect, onClose, multiSelect, onToggleSelect]);

  const goToStakeholder = useCallback((sprint: JiraSprint) => {
    const team = extractTeamPrefix(sprint.name) ?? "";
    router.push(`/stakeholder?team=${team}&sprintId=${sprint.id}`);
    onClose();
  }, [router, onClose]);

  function renderRow(sprint: JiraSprint, options: { showBadge: boolean; showHide: boolean; showStakeholder: boolean }) {
    const isPinned = pinnedIds.has(String(sprint.id));
    return (
      <SprintRow
        key={sprint.id}
        sprint={sprint}
        isPinned={isPinned}
        isChecked={multiSelect && selectedIds ? selectedIds.has(String(sprint.id)) : undefined}
        showBadge={options.showBadge}
        showHide={multiSelect ? false : options.showHide}
        showStakeholder={multiSelect ? false : options.showStakeholder}
        showPin={!multiSelect}
        onSelect={() => selectSprint(sprint)}
        onPin={() => onPin(String(sprint.id))}
        onHide={() => handleToggleHidden(sprint.id, sprint.hidden ?? false)}
        onStakeholder={() => goToStakeholder(sprint)}
      />
    );
  }

  const hasDefaultContent = pinnedSection.length > 0 || activeFutureSection.length > 0 || recentClosedSection.length > 0;

  const content = (
    <div
      ref={ref}
      className={portalAnchor ? "fixed z-[9999] w-96 rounded-lg border border-border-strong bg-[var(--color-surface-floating)]" : `absolute top-full z-50 mt-1.5 w-96 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-popover)] ${alignLeft ? "left-0" : "right-0"}`}
      style={portalAnchor ? {
        top: portalAnchor.top,
        left: portalAnchor.left,
        right: portalAnchor.right,
        boxShadow: "0 4px 24px rgba(0,0,0,0.22), 0 1px 6px rgba(0,0,0,0.12)",
        animation: "sprintListIn 0.15s ease-out",
      } : { animation: "sprintListIn 0.15s ease-out" }}
    >
      {/* Search + filter */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
        <div className="min-w-0 flex-1">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sprints..."
            inputSize="sm"
            autoFocus
          />
        </div>
        <TeamFilterDropdown teams={teamOptions} active={teamFilter} onToggle={setTeamFilter} />
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto px-1.5 pb-1">
        {isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map((s) =>
              renderRow(s, {
                showBadge: true,
                showHide: !pinnedIds.has(String(s.id)),
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
                  {syncError ? (
                    <div className="mt-2 flex items-start justify-center gap-2 text-body-sm text-red-400">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                      <span>
                        {syncError}{" "}
                        <button type="button" onClick={handleSync} className="cursor-pointer text-red-300 underline underline-offset-2 hover:text-red-200">Retry</button>
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="mt-2 inline-flex items-center gap-1 text-body-sm text-text-muted cursor-pointer hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
                      {syncing ? "Syncing..." : "Sync from Jira"}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        ) : (
          <>
            {!hasDefaultContent && allSprints.length === 0 && (
              <div className="px-3 py-5 text-center text-body-sm text-text-muted">
                No sprints cached. Sync from Jira to load.
              </div>
            )}

            {!hasDefaultContent && allSprints.length > 0 && teamFilter && (
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
                  className="flex items-center gap-2 min-w-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  onClick={() => { onSelect("__backlog__", "Backlog"); onClose(); }}
                >
                  <Inbox className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
                  <span>Backlog</span>
                  {backlogCount > 0 && (
                    <span className="rounded-full bg-overlay-default px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-muted">
                      {backlogCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onPin("__backlog__")}
                  className={`flex h-5 w-5 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    pinnedIds.has("__backlog__")
                      ? "text-[var(--color-brand-400)]"
                      : "text-text-muted hover:text-text-tertiary hover:bg-hover-list-item"
                  }`}
                  title={pinnedIds.has("__backlog__") ? "Unpin from tabs" : "Pin to tab"}
                >
                  <Pin className="h-3 w-3" strokeWidth={1.5} fill={pinnedIds.has("__backlog__") ? "currentColor" : "none"} />
                </button>
              </div>
            )}

            {recentClosedSection.length > 0 && (
              <>
                <SectionHeader label="Closed" count={recentClosedSection.length} collapsed={!closedExpanded} onToggle={() => setClosedExpanded((v) => !v)} />
                {closedExpanded && recentClosedSection.map((s) => renderRow(s, { showBadge: false, showHide: true, showStakeholder: true }))}
              </>
            )}

            {hiddenSection.length > 0 && (
              <>
                <SectionHeader label="Hidden" count={hiddenSection.length} collapsed={!hiddenExpanded} onToggle={() => setHiddenExpanded((v) => !v)} />
                {hiddenExpanded && hiddenSection.map((s) => renderRow(s, { showBadge: true, showHide: true, showStakeholder: false }))}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer: subtle sync link */}
      {!isSearching && (
        <div className="flex items-center justify-center border-t border-border-default px-3 py-1.5">
          {syncError ? (
            <span className="flex items-center gap-1.5 text-[11px] text-red-400">
              <AlertCircle size={11} strokeWidth={1.5} />
              Sync failed
              <button type="button" onClick={handleSync} className="cursor-pointer underline underline-offset-2 hover:text-red-300">retry</button>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
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

      <style>{`
        @keyframes sprintListIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  return portalAnchor ? createPortal(content, document.body) : content;
}
