"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { X, Pin, Check, RefreshCw, Eye, EyeOff, AlertCircle, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";
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
  if (state === "active") return "#4aaa60";
  if (state === "future") return "#60a5fa";
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
  collapsible,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  if (collapsible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 pt-2.5 pb-0.5 text-caption font-medium uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-tertiary"
      >
        <ChevronRight
          size={10}
          strokeWidth={2}
          className="shrink-0 transition-transform duration-150"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
        />
        {label}
      </button>
    );
  }

  return (
    <div className="px-3 pt-2.5 pb-0.5 text-caption font-medium uppercase tracking-widest text-text-muted">
      {label}
    </div>
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

function TeamChips({
  teams,
  active,
  onToggle,
}: {
  teams: string[];
  active: string | null;
  onToggle: (team: string | null) => void;
}) {
  if (teams.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 px-3 pb-1">
      {teams.map((t) => {
        const isActive = active === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(isActive ? null : t)}
            className={`rounded-md px-2 py-0.5 text-caption font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                : "text-text-muted hover:bg-overlay-subtle hover:text-text-tertiary"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function SprintRow({
  sprint,
  isPinned,
  showBadge,
  showHide,
  showStakeholder,
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
  onSelect: () => void;
  onPin: () => void;
  onHide: () => void;
  onStakeholder: () => void;
}) {
  const isHidden = sprint.hidden ?? false;
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      onClick={onSelect}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: stateColor(sprint.state) }}
        />
        <span className="truncate">{sprint.name}</span>
        {showBadge && <StateBadge state={sprint.state} />}
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-1">
        <span className="text-xs tabular-nums text-text-muted">
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
      </span>
    </button>
  );
}

// -- Main component -----------------------------------------------------------

export function SprintListModal({
  onClose,
  onSelect,
  onPin,
  pinnedIds,
  alignLeft,
}: {
  onClose: () => void;
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
  alignLeft?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: sprints, mutate } = useJiraSprints();

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

  // Reset syncDone when search changes
  useEffect(() => { setSyncDone(false); }, [search]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleToggleHidden = useCallback(async (sprintId: number, currentlyHidden: boolean) => {
    const currentHiddenIds = allSprints.filter((s) => s.hidden).map((s) => s.id);
    let newHiddenIds: number[];
    if (currentlyHidden) {
      newHiddenIds = currentHiddenIds.filter((id) => id !== sprintId);
    } else {
      newHiddenIds = [...currentHiddenIds, sprintId];
      // Auto-unpin when hiding
      if (pinnedIds.has(String(sprintId))) {
        onPin(String(sprintId));
      }
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

  // Shared row handlers
  const selectSprint = useCallback((sprint: JiraSprint) => {
    onSelect(String(sprint.id), sprint.name);
    onClose();
  }, [onSelect, onClose]);

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
        showBadge={options.showBadge}
        showHide={options.showHide}
        showStakeholder={options.showStakeholder}
        onSelect={() => selectSprint(sprint)}
        onPin={() => onPin(String(sprint.id))}
        onHide={() => handleToggleHidden(sprint.id, sprint.hidden ?? false)}
        onStakeholder={() => goToStakeholder(sprint)}
      />
    );
  }

  const hasDefaultContent = pinnedSection.length > 0 || activeFutureSection.length > 0 || recentClosedSection.length > 0;

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 mt-1.5 w-96 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-popover)] ${alignLeft ? "left-0" : "right-0"}`}
      style={{ animation: "sprintListIn 0.15s ease-out" }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-1.5">
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
        />
      </div>

      {/* Team filter chips */}
      <TeamChips teams={teamOptions} active={teamFilter} onToggle={setTeamFilter} />

      {/* Content */}
      <div className="max-h-80 overflow-y-auto px-1.5 pb-1.5">
        {isSearching ? (
          /* -- Search mode: flat list across all sprints -- */
          searchResults.length > 0 ? (
            searchResults.map((s) =>
              renderRow(s, {
                showBadge: true,
                showHide: !pinnedIds.has(String(s.id)),
                showStakeholder: !(s.hidden ?? false),
              }),
            )
          ) : (
            <div className="px-3 py-6 text-center">
              {syncDone ? (
                <p className="text-xs text-text-muted">
                  No sprints found in Jira either.
                </p>
              ) : (
                <>
                  <p className="text-xs text-text-muted">
                    No sprints match &ldquo;{search}&rdquo;
                  </p>
                  {syncError ? (
                    <div className="mt-3 flex items-start justify-center gap-2 text-xs text-red-400">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                      <span>
                        {syncError}
                        <button
                          type="button"
                          onClick={handleSync}
                          className="ml-1.5 cursor-pointer text-red-300 underline underline-offset-2 hover:text-red-200"
                        >
                          Retry
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary cursor-pointer hover:bg-overlay-subtle hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-50 disabled:cursor-not-allowed"
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
          /* -- Default mode: sectioned view -- */
          <>
            {!hasDefaultContent && allSprints.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-text-muted">
                No sprints cached. Sync from Jira to load.
              </div>
            )}

            {!hasDefaultContent && allSprints.length > 0 && teamFilter && (
              <div className="px-3 py-6 text-center text-xs text-text-muted">
                No sprints for team {teamFilter}.
              </div>
            )}

            {/* Pinned */}
            {pinnedSection.length > 0 && (
              <>
                <SectionHeader label="Pinned" />
                {pinnedSection.map((s) =>
                  renderRow(s, { showBadge: true, showHide: false, showStakeholder: true }),
                )}
              </>
            )}

            {/* Active & Future */}
            {activeFutureSection.length > 0 && (
              <>
                <SectionHeader label="Active & Future" />
                {activeFutureSection.map((s) =>
                  renderRow(s, { showBadge: false, showHide: true, showStakeholder: true }),
                )}
              </>
            )}

            {/* Recent closed */}
            {recentClosedSection.length > 0 && (
              <>
                <SectionHeader
                  label="Recent closed"
                  collapsible
                  collapsed={!closedExpanded}
                  onToggle={() => setClosedExpanded((v) => !v)}
                />
                {closedExpanded &&
                  recentClosedSection.map((s) =>
                    renderRow(s, { showBadge: false, showHide: true, showStakeholder: true }),
                  )}
              </>
            )}

            {/* Hidden sprints */}
            {hiddenSection.length > 0 && (
              <>
                <div className="mx-3 mt-2 border-t border-border-default" />
                <button
                  type="button"
                  onClick={() => setHiddenExpanded((v) => !v)}
                  className="flex w-full items-center gap-1.5 px-3 pt-1.5 pb-0.5 text-caption font-medium uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-tertiary"
                >
                  <ChevronRight
                    size={10}
                    strokeWidth={2}
                    className="shrink-0 transition-transform duration-150"
                    style={{ transform: hiddenExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                  />
                  {hiddenSection.length} hidden
                </button>
                {hiddenExpanded &&
                  hiddenSection.map((s) =>
                    renderRow(s, { showBadge: true, showHide: true, showStakeholder: false }),
                  )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer: sync button (default mode only) */}
      {!isSearching && (
        <div className="border-t border-border-default px-3 py-2">
          {syncError && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0">
                {syncError}
                <button
                  type="button"
                  onClick={handleSync}
                  className="ml-1.5 cursor-pointer text-red-300 underline underline-offset-2 hover:text-red-200"
                >
                  Retry
                </button>
              </span>
            </div>
          )}
          <Button
            variant={syncDone ? "soft" : "ghost"}
            size="md"
            disabled={syncing}
            onClick={handleSync}
            icon={syncDone
              ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              : <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            }
            className="w-full"
          >
            {syncDone ? "Synced" : syncing ? "Syncing..." : "Sync sprints"}
          </Button>
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
}
