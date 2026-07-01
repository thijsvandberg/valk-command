"use client";

import { memo, type Dispatch, type SetStateAction } from "react";
import { Inbox, Plus, Bell, BellDot } from "lucide-react";
import { GroupStatBar, type StatCriterion } from "@/components/sprint-board/GroupStatBar";
import type { Sprint, Ticket } from "@/types/ticket";
import type { SortField, SortDir, InlineTagId } from "@/components/sprint-board/filter-bar-types";
import type { GroupSyncTarget, GroupSyncProgress, GroupSyncResult } from "@/lib/group-sync";

interface SingleSprintHeaderProps {
  activeSprintId: string;
  activeSprint: Sprint | null;
  allTickets: Ticket[];
  statusFilter: Set<string>;
  setStatusFilter: (next: Set<string>) => void;
  warningLensActive: boolean;
  setWarningLensActive: (v: boolean) => void;
  flatComposerOpen: boolean;
  setFlatComposerOpen: Dispatch<SetStateAction<boolean>>;
  updatesOpen: boolean;
  setUpdatesOpen: Dispatch<SetStateAction<boolean>>;
  statusChangeCount: number;
  sortField: SortField;
  sortDir: SortDir;
  onMetricSort: (metric: "sp" | "bv") => void;
  onMetricToggleColumn: (metric: "sp" | "bv") => void;
  visibleTags: Set<InlineTagId>;
  slotSprintsSet: Set<string>;
  onPinSprint: (id: string) => void;
  onEditSprintDetails: (id: string) => void;
  onCloseSprintFromGroup: (id: string) => void;
  onSyncGroup: (target: GroupSyncTarget, onProgress: (p: GroupSyncProgress) => void) => Promise<GroupSyncResult>;
  planningVisible: boolean;
  pencilCapacityMap: Record<string, number | null>;
  setPencilCapacity: (key: string, v: number | null) => void;
  sprintUsedMap: Record<string, number>;
  capacityMeterShownMap: Record<string, boolean>;
  setCapacityMeterShownMap: Dispatch<SetStateAction<Record<string, boolean>>>;
}

const CRIT_TO_STATUS: Record<string, string> = { todo: "TO DO", "in-progress": "IN PROGRESS", test: "TEST", done: "DONE" };
const STATUS_TO_CRIT: Record<string, StatCriterion> = { "TO DO": "todo", "IN PROGRESS": "in-progress", TEST: "test", DONE: "done" };

/**
 * The single-sprint (flat view) header: the status-pill bar plus the create-story and
 * status-updates toggles for the active sprint or backlog. Extracted from SprintBoard's
 * ~25-dependency useMemo (BRDG-416): as a memoised component it re-renders exactly when
 * its inputs change, so there is no hand-maintained dep array to drift out of date.
 * The host decides whether it is applicable (flat view, an active sprint or the backlog);
 * this returns null defensively otherwise.
 */
export const SingleSprintHeader = memo(function SingleSprintHeader({
  activeSprintId,
  activeSprint,
  allTickets,
  statusFilter,
  setStatusFilter,
  warningLensActive,
  setWarningLensActive,
  flatComposerOpen,
  setFlatComposerOpen,
  updatesOpen,
  setUpdatesOpen,
  statusChangeCount,
  sortField,
  sortDir,
  onMetricSort,
  onMetricToggleColumn,
  visibleTags,
  slotSprintsSet,
  onPinSprint,
  onEditSprintDetails,
  onCloseSprintFromGroup,
  onSyncGroup,
  planningVisible,
  pencilCapacityMap,
  setPencilCapacity,
  sprintUsedMap,
  capacityMeterShownMap,
  setCapacityMeterShownMap,
}: SingleSprintHeaderProps) {
  const isBacklog = activeSprintId === "__backlog__";
  if (!isBacklog && !activeSprint) return null;
  const label = isBacklog ? "Backlog" : activeSprint!.name;
  const key = isBacklog ? "__backlog__" : activeSprint!.id;
  // Multi-select: every filtered status lights up its pill. The warning lens stays a
  // separate single criterion handled via activeCriterion.
  const activeCriteria = new Set<StatCriterion>(
    [...statusFilter].map((s) => STATUS_TO_CRIT[s]).filter(Boolean) as StatCriterion[],
  );
  const activeCriterion: StatCriterion | null = warningLensActive ? "unpointed" : null;
  // The "+" lives in the header next to "...", matching the grouped/All view's per-group create
  // button. Jira rejects creating into a closed sprint, so it only shows where creation is allowed.
  const canCreate = isBacklog || activeSprint?.state !== "closed";
  const createAction = canCreate ? (
    <button
      type="button"
      aria-label="Create story in this sprint"
      onClick={(e) => { e.stopPropagation(); setFlatComposerOpen((v) => !v); }}
      className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:background-color_.12s_ease,color_.12s_ease] ${
        flatComposerOpen
          ? "bg-overlay-strong text-text-secondary"
          : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
      }`}
    >
      <Plus size={14} strokeWidth={2} aria-hidden />
    </button>
  ) : undefined;
  // Subtle, icon-only open/close toggle for the status-update lines. Only shown when this
  // sprint actually has updates (BRDG-414).
  const updatesToggle = statusChangeCount > 0 ? (
    <button
      type="button"
      aria-label={updatesOpen ? "Hide status updates" : "Show status updates"}
      aria-pressed={updatesOpen}
      title={updatesOpen ? "Hide status updates" : `Show ${statusChangeCount} status update${statusChangeCount === 1 ? "" : "s"}`}
      onClick={(e) => { e.stopPropagation(); setUpdatesOpen((v) => !v); }}
      className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:background-color_.12s_ease,color_.12s_ease] ${
        updatesOpen
          ? "text-[var(--color-brand-400)] hover:bg-overlay-default"
          : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
      }`}
    >
      {updatesOpen ? <BellDot size={14} strokeWidth={2} aria-hidden /> : <Bell size={14} strokeWidth={2} aria-hidden />}
    </button>
  ) : undefined;
  return (
    <GroupStatBar
      createAction={createAction}
      updatesAction={updatesToggle}
      sortField={sortField}
      sortDir={sortDir}
      onMetricSort={onMetricSort}
      onMetricToggleColumn={onMetricToggleColumn}
      spColumnHidden={!visibleTags.has("storyPoints")}
      bvColumnHidden={!visibleTags.has("businessValue")}
      // Use the unfiltered sprint set so the status breakdown always shows every
      // pill — otherwise filtering down to one status hides the others and you
      // can no longer click to toggle the filter back off.
      tickets={allTickets}
      label={label}
      labelWidthClass=""
      isActive={!isBacklog && activeSprint?.state === "active"}
      leadingIcon={isBacklog ? <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} /> : undefined}
      activeCriterion={activeCriterion}
      activeCriteria={activeCriteria}
      onFilterChange={(crit) => {
        if (crit === null) {
          // Only the warning lens emits null (a re-click of its active pill). While the
          // lens is on, null means "turn it off" (BRDG-313, req 2).
          if (warningLensActive) { setWarningLensActive(false); return; }
          setStatusFilter(new Set());
          return;
        }
        if (crit === "unpointed") {
          // Enter the transient warning lens; never mutate the persistent filters, so
          // turning it off restores the prior view exactly (BRDG-313, req 1/2).
          setWarningLensActive(true);
          return;
        }
        const status = CRIT_TO_STATUS[crit];
        if (!status) return;
        // Toggle the status in/out of the filter set so clicks expand the filter
        // instead of replacing it. Activating a status leaves the warning lens.
        if (warningLensActive) setWarningLensActive(false);
        const next = new Set(statusFilter);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        setStatusFilter(next);
      }}
      {...(!isBacklog && activeSprint
        ? {
            onPin: () => onPinSprint(key),
            isPinned: slotSprintsSet.has(key),
            pinDisabled: slotSprintsSet.size >= 8,
            sprint: activeSprint,
            onEditSprintDetails: () => onEditSprintDetails(key),
            onCloseSprint: activeSprint.state === "active" ? () => onCloseSprintFromGroup(key) : undefined,
            // Start happens inside the edit modal (date validation + Start button live there).
            onStartSprint: activeSprint.state === "future" ? () => onEditSprintDetails(key) : undefined,
            onSync: (onProgress: (p: GroupSyncProgress) => void) => onSyncGroup({ kind: "sprint", id: key, label }, onProgress),
            syncKind: "sprint" as const,
          }
        : {})}
      {...(!isBacklog && activeSprint && planningVisible
        ? {
            planningOn: true,
            pencilCapacity: pencilCapacityMap[key] ?? null,
            onPencilCapacityChange: (v: number | null) => setPencilCapacity(key, v),
            // Always the whole sprint, regardless of the active filter / warning lens.
            usedPointsOverride: sprintUsedMap[key] ?? 0,
            capacityMeterShown: capacityMeterShownMap[key] ?? false,
            onToggleCapacityMeter: () => setCapacityMeterShownMap((prev) => ({ ...prev, [key]: !(prev[key] ?? false) })),
          }
        : {})}
    />
  );
});
