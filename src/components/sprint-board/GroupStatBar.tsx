"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { Ticket, Sprint } from "@/types/ticket";
import type { SortField, SortDir } from "@/components/sprint-board/filter-bar-types";
import type { GroupSyncProgress, GroupSyncResult, GroupSyncState } from "@/lib/group-sync";
import { getSpColor, getBvColor, effectivePoints } from "@/types/ticket";
import { FullnessMeter } from "./FullnessMeter";
import { ChevronRight, ChevronDown, Pin, AlertTriangle, MoreHorizontal, RefreshCw } from "lucide-react";
import { StatPill, StatusPill } from "./SprintStatPill";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Tooltip } from "@/components/shared/Tooltip";
import { Checkbox } from "@/components/shared/Checkbox";
import { SprintDetailsPopover } from "./SprintDetailsPopover";
import { getJiraSprintUrl } from "@/lib/jira-url";
import { pluralize } from "@/lib/pluralize";
import { ticketWarnings } from "./warning-filter";

export type StatCriterion = "todo" | "in-progress" | "test" | "done" | "unpointed";

export interface GroupStatBarProps {
  tickets: Ticket[];
  label?: string;
  /** Optional icon rendered just before the label (e.g. the backlog icon). */
  leadingIcon?: ReactNode;
  /**
   * Multiselect: when provided, a tri-state "select all in this group" checkbox is
   * rendered at the head of the label zone (left of the chevron). Clicking it toggles
   * the whole group's selection. Mirrors the row checkboxes' hover-reveal behavior.
   */
  onSelectAll?: () => void;
  /** All of the group's selectable rows are currently checked. */
  selectAllChecked?: boolean;
  /** Some but not all of the group's rows are checked (partial state). */
  selectAllIndeterminate?: boolean;
  /** A selection exists somewhere; keeps the select-all checkbox visible (not hover-gated). */
  selectionActive?: boolean;
  activeCriterion?: StatCriterion | null;
  /**
   * Multi-select status filter: when provided, the four status pills derive their
   * active state from set membership and clicking a pill always emits that raw
   * criterion (the parent toggles it in/out of its set). Without this prop the bar
   * stays single-select, driven by `activeCriterion` (used by the legacy compare view).
   * The "unpointed" warning lens is never multi-select; it keeps using `activeCriterion`.
   */
  activeCriteria?: Set<StatCriterion>;
  onFilterChange?: (criterion: StatCriterion | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * Width class for the fixed label zone that keeps the stats column-aligned
   * across rows. Defaults to a hard `w-48`; callers on narrow surfaces can pass
   * a container-query-gated value (e.g. `@2xl:w-48`) so the zone collapses to
   * the label's own width when the bar is cramped, removing the dead space
   * between a short sprint name and the item count.
   */
  labelWidthClass?: string;
  /** Show only a colored dot + count for status pills, no label text */
  showDot?: boolean;
  /** When false, the per-status (TO DO / IN PROGRESS / TEST / DONE) count pills are hidden. */
  showStatusCounts?: boolean;
  /**
   * When false, the estimate-hygiene warning indicator (the AlertTriangle) and its
   * underlying per-ticket checks are skipped entirely. Used on the new-story inbox,
   * where sprint-estimate hygiene is not relevant.
   */
  showWarnings?: boolean;
  /** When false, the SP and BV total badges are hidden. Used on the new-story inbox. */
  showMetrics?: boolean;
  /** When false, the "avg N" business-value average next to the BV total is hidden. */
  showBvAvg?: boolean;
  /** When provided, renders a pin toggle next to the label (used to pin a sprint group to the tab bar). */
  onPin?: () => void;
  isPinned?: boolean;
  pinDisabled?: boolean;
  /** Marks the group's sprint as the currently running (active) Jira sprint with a live dot. */
  isActive?: boolean;
  /** The Jira sprint this group represents. When provided, a "..." menu exposes its goal/dates. */
  sprint?: Sprint;
  /** Opens the sprint edit modal for this group's sprint (goal + dates). */
  onEditSprintDetails?: () => void;
  /** Closes (finishes) this group's sprint. Only surfaced for active sprints. */
  onCloseSprint?: () => void;
  /** Starts (activates) this group's sprint. Only surfaced for future sprints. */
  onStartSprint?: () => void;
  /**
   * Runs a tranched sync of this group (sprint or epic) from Jira, reporting
   * progress. When provided, the "..." menu's first level exposes a Sync action.
   */
  onSync?: (onProgress: (progress: GroupSyncProgress) => void) => Promise<GroupSyncResult>;
  /** What the group represents; drives the sync label. Defaults from `sprint`. */
  syncKind?: "sprint" | "epic";
  /** Action pinned into the right cluster between the warning and the "..." menu (e.g. a create "+"). */
  createAction?: ReactNode;
  /** Subtle toggle pinned into the right cluster (BRDG-414: open/close all status-change lines). */
  updatesAction?: ReactNode;
  /**
   * Forward-planning mode (BRDG-303). When on, the bar shows a fullness meter
   * (effective points / pencil capacity). Only meaningful for real sprint groups;
   * the consumer suppresses it for the backlog and non-sprint groupings.
   */
  planningOn?: boolean;
  /** The sprint's pencil capacity (PO guess), or null when unset. */
  pencilCapacity?: number | null;
  /** Persist a new pencil capacity (null clears it). */
  onPencilCapacityChange?: (value: number | null) => void;
  /**
   * Per-sprint capacity meter visibility for active sprints. The meter is hidden by
   * default once a sprint is running; this re-shows it. Ignored for non-active sprints,
   * where the meter follows planning mode as before.
   */
  capacityMeterShown?: boolean;
  /** Toggles `capacityMeterShown` for this active sprint (surfaced in the "..." menu). */
  onToggleCapacityMeter?: () => void;
  /**
   * Override the meter's "used" value (BRDG-303). On the epic-children-by-sprint
   * view the group only holds the open epic's children, but the fullness meter
   * must reflect the WHOLE sprint's load; the consumer passes the sprint total
   * here. When omitted, "used" is summed from this group's tickets (sprint board).
   */
  usedPointsOverride?: number;
  /** The board's current sort, used to mark the SP/BV chip that drives the order. */
  sortField?: SortField;
  sortDir?: SortDir;
  /** Single-click on the SP/BV chip: sort the board by that metric (toggles direction). */
  onMetricSort?: (metric: "sp" | "bv") => void;
  /** Double-click on the SP/BV chip: show/hide that metric's per-row column. */
  onMetricToggleColumn?: (metric: "sp" | "bv") => void;
  /** Whether the per-row SP / BV column is currently hidden (dims the header chip). */
  spColumnHidden?: boolean;
  bvColumnHidden?: boolean;
}

// A real double-click also fires two clicks, so a single click waits this long for a
// possible second click before committing to the sort. Short enough to feel responsive.
const METRIC_CLICK_DELAY_MS = 200;

// Two-row tooltip (total + average) styled like the estimate-hygiene warning tooltip:
// a metric-colored dot per line for a tidier read than a single run-on sentence.
function metricTooltip(label: string, total: number, avg: string | null, suffix: string, dotColor: string): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
        {`${label}: ${total}`}
      </span>
      {avg && (
        <span className="flex items-center gap-2 whitespace-nowrap text-text-tertiary">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60" style={{ backgroundColor: dotColor }} aria-hidden />
          {`Average ${avg} ${suffix}`}
        </span>
      )}
    </div>
  );
}

// Interactive variant of the metric tooltip: the same total/average lines plus a
// hint describing the click-to-sort / double-click-to-hide affordance, and whether
// the per-row column is currently hidden.
function metricActionTooltip(label: string, total: number, avg: string | null, suffix: string, dotColor: string, hidden: boolean): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
        {`${label}: ${total}`}
      </span>
      {avg && (
        <span className="flex items-center gap-2 whitespace-nowrap text-text-tertiary">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60" style={{ backgroundColor: dotColor }} aria-hidden />
          {`Average ${avg} ${suffix}`}
        </span>
      )}
      <span className="mt-0.5 border-t border-border-subtle pt-1.5 text-label leading-relaxed text-text-tertiary">
        {hidden ? "Click to sort and show the column" : "Click to sort · double-click to hide the column"}
      </span>
    </div>
  );
}

// Tooltip for the sprint label: a small caption above the goal text so a glance
// reads it as the sprint's goal rather than a stray note.
function goalTooltip(goal: string): ReactNode {
  return (
    <div className="flex max-w-[18rem] flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-wide text-text-tertiary">Sprint goal</span>
      <span className="whitespace-pre-line text-text-primary">{goal}</span>
    </div>
  );
}

export const GroupStatBar = memo(function GroupStatBar({
  tickets,
  label,
  leadingIcon,
  onSelectAll,
  selectAllChecked = false,
  selectAllIndeterminate = false,
  selectionActive = false,
  activeCriterion = null,
  activeCriteria,
  onFilterChange,
  isCollapsed,
  onToggleCollapse,
  labelWidthClass = "w-48",
  showDot = false,
  showStatusCounts = true,
  showWarnings = true,
  showMetrics = true,
  showBvAvg = true,
  onPin,
  isPinned = false,
  pinDisabled = false,
  isActive = false,
  sprint,
  onEditSprintDetails,
  onCloseSprint,
  onStartSprint,
  onSync,
  syncKind,
  createAction,
  updatesAction,
  planningOn = false,
  capacityMeterShown = false,
  onToggleCapacityMeter,
  pencilCapacity = null,
  onPencilCapacityChange,
  usedPointsOverride,
  sortField,
  sortDir,
  onMetricSort,
  onMetricToggleColumn,
  spColumnHidden = false,
  bvColumnHidden = false,
}: GroupStatBarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Pending single-click sort timers, keyed by metric, so a double-click can cancel the
  // sort before it fires. Cleared on unmount so a late timer never calls a stale handler.
  const metricClickTimers = useRef<Record<"sp" | "bv", ReturnType<typeof setTimeout> | null>>({ sp: null, bv: null });
  useEffect(() => () => {
    for (const t of Object.values(metricClickTimers.current)) if (t) clearTimeout(t);
  }, []);

  function handleMetricClick(metric: "sp" | "bv") {
    if (!onMetricSort || metricClickTimers.current[metric]) return;
    metricClickTimers.current[metric] = setTimeout(() => {
      metricClickTimers.current[metric] = null;
      onMetricSort(metric);
    }, METRIC_CLICK_DELAY_MS);
  }
  function handleMetricDoubleClick(metric: "sp" | "bv") {
    const pending = metricClickTimers.current[metric];
    if (pending) { clearTimeout(pending); metricClickTimers.current[metric] = null; }
    onMetricToggleColumn?.(metric);
  }
  const metricInteractive = !!onMetricSort || !!onMetricToggleColumn;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // The sync lifecycle lives here (not in the popover) so a spinner can show in the
  // header bar while the menu is closed.
  const [syncState, setSyncState] = useState<GroupSyncState>("idle");
  const [syncProgress, setSyncProgress] = useState<GroupSyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<GroupSyncResult | null>(null);

  async function runSync() {
    if (!onSync || syncState === "running") return;
    setSyncState("running");
    setSyncResult(null);
    setSyncProgress({ phase: "planning", done: 0, total: 0 });
    try {
      const res = await onSync(setSyncProgress);
      setSyncResult(res);
      setSyncState("done");
    } catch {
      setSyncState("error");
    }
  }
  // Soft-deleted tickets (removed from Jira) are hidden from the board body by
  // default, so they must not inflate the header's item count, SP/BV totals, or
  // status pills — otherwise an empty sprint still reads as having items.
  const liveTickets = tickets.filter((t) => !t.removedFromJiraAt);
  const totalPoints = liveTickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  // Effective points for the fullness meter: real SP wins, else the guestimation,
  // so the meter reflects both refined and penciled work (BRDG-303).
  const usedEffective = liveTickets.reduce((sum, t) => sum + effectivePoints(t.storyPoints, t.guestimation), 0);
  const bvTickets = liveTickets.filter((t) => t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED");
  const bvTotal = bvTickets.reduce((sum, t) => sum + (t.businessValue ?? 0), 0);
  const bvAvg = bvTickets.length > 0 ? (bvTotal / bvTickets.length).toFixed(1) : null;
  // Average effort per estimated (pointed, non-deprecated) ticket, surfaced on the SP badge hover.
  const spTickets = liveTickets.filter((t) => t.storyPoints != null && t.storyPoints > 0 && t.jiraStatus !== "DEPRECATED");
  const spAvg = spTickets.length > 0 ? (spTickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0) / spTickets.length).toFixed(1) : null;
  const showSprintMenu = onSync != null || (sprint != null && (onEditSprintDetails != null || onCloseSprint != null));
  const menuKind = syncKind ?? (sprint != null ? "sprint" : "epic");
  // Progress-aware label for the header spinner: surfaces how many tickets are done
  // versus the total while the tranches run.
  const syncTooltip =
    syncProgress?.phase === "planning"
      ? `Preparing to sync ${menuKind}…`
      : syncProgress?.phase === "reconciling"
        ? `Finishing ${menuKind} sync…`
        : syncProgress && syncProgress.total > 0
          ? `Synced ${syncProgress.done} of ${syncProgress.total} tickets`
          : `Syncing ${menuKind} from Jira`;
  const todoCount = liveTickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = liveTickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = liveTickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = liveTickets.filter((t) => t.jiraStatus === "DONE").length;
  // Tally the per-kind warning counts from the shared ticketWarnings helper so the
  // tooltip lines below and the per-row labels (BoardRow) can never describe different
  // problems (BRDG-313). The unpointed kind already requires the active sprint inside
  // the helper, matching the showNoPointsWarning gating.
  let noPointsCount = 0;
  let noSubtasksCount = 0;
  let deprecatedWithSp = 0;
  let closedWithOpenSubtasks = 0;
  if (showWarnings) {
    for (const t of liveTickets) {
      for (const kind of ticketWarnings(t, isActive)) {
        if (kind === "unpointed") noPointsCount++;
        else if (kind === "no_subtasks") noSubtasksCount++;
        else if (kind === "deprecated_with_points") deprecatedWithSp++;
        else closedWithOpenSubtasks++;
      }
    }
  }
  // When every ticket shares the same status, the per-status pill just echoes the "X items"
  // count, so suppress the breakdown to cut noise (e.g. an all-TO DO sprint).
  const showStatusBreakdown = showStatusCounts && new Set(liveTickets.map((t) => t.jiraStatus)).size > 1;

  const isCollapsible = onToggleCollapse !== undefined;

  // Estimate-hygiene alerts (unpointed stories, deprecated-but-pointed) collapse
  // into a single warning icon on the far right rather than inline pills.
  // Unpointed stories only matter for the active sprint: future/backlog work is
  // expected to be un-estimated, so that warning is suppressed there. The
  // deprecated-with-points warning always applies.
  const showNoPointsWarning = noPointsCount > 0 && isActive;
  const warningParts: string[] = [];
  if (showNoPointsWarning) {
    warningParts.push(`${noPointsCount} ${noPointsCount === 1 ? "story" : "stories"} without a story point estimate`);
  }
  // no_subtasks is already active-sprint-gated inside ticketWarnings, so the count
  // is zero off the active sprint; mirror showNoPointsWarning's isActive guard anyway.
  if (noSubtasksCount > 0 && isActive) {
    warningParts.push(`${noSubtasksCount} ${noSubtasksCount === 1 ? "ticket" : "tickets"} without subtasks`);
  }
  if (deprecatedWithSp > 0) {
    warningParts.push(`${deprecatedWithSp} deprecated ${deprecatedWithSp === 1 ? "ticket" : "tickets"} still with story points`);
  }
  if (closedWithOpenSubtasks > 0) {
    warningParts.push(`${closedWithOpenSubtasks} ${closedWithOpenSubtasks === 1 ? "story" : "stories"} closed with open subtasks`);
  }
  const warningLabel = warningParts.join(" · ");
  // The warning is clickable whenever it shows anything (unpointed and/or
  // deprecated-with-points); the consumer filters to the matching items.
  const canFilterWarnings = warningLabel !== "" && onFilterChange !== undefined;

  // In multi-select mode the parent owns the set, so a pill click emits its raw
  // criterion and the parent toggles membership. The single-select fallback (and the
  // "unpointed" warning lens, which is never multi-select) collapses a re-click of the
  // active pill to null.
  const multiSelect = activeCriteria !== undefined;
  function toggle(criterion: StatCriterion) {
    if (multiSelect && criterion !== "unpointed") {
      onFilterChange?.(criterion);
      return;
    }
    onFilterChange?.(activeCriterion === criterion ? null : criterion);
  }
  const isCriterionActive = (criterion: StatCriterion) =>
    multiSelect ? activeCriteria!.has(criterion) : activeCriterion === criterion;

  return (
    <div className="@container flex w-full items-center gap-2">
      {/* Fixed-width label zone so the stats (item count onward) start at the same x
          across every group row, regardless of sprint name length (BRDG-239). */}
      <div className={`flex shrink-0 items-center gap-2 ${label ? `${labelWidthClass} min-w-0` : ""}`}>
        {/* Select-all-in-group checkbox: stops propagation so it never toggles the
            header's collapse. Mirrors the row checkbox visibility (hidden until the
            header is hovered, unless a selection is already active). */}
        {onSelectAll && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selectAllChecked ? "true" : selectAllIndeterminate ? "mixed" : "false"}
            aria-label="Select all items in this group"
            onClick={(e) => { e.stopPropagation(); onSelectAll(); }}
            className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:opacity_.12s_ease] ${
              selectAllChecked || selectAllIndeterminate || selectionActive
                ? "opacity-100"
                : "opacity-0 group-hover/grouprow:opacity-100"
            }`}
          >
            <Checkbox checked={selectAllChecked} indeterminate={selectAllIndeterminate} />
          </button>
        )}
        {isCollapsible && (
          isCollapsed
            ? <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
            : <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
        )}
        {/* Pin sits before the label (BRDG-239); it reserves its slot so labels stay aligned. */}
        {onPin && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!pinDisabled || isPinned) onPin(); }}
            disabled={pinDisabled && !isPinned}
            title={isPinned ? "Unpin from sprint bar" : pinDisabled ? "Maximum 8 pinned sprints" : "Pin to sprint bar"}
            aria-label={isPinned ? "Unpin from sprint bar" : "Pin to sprint bar"}
            aria-pressed={isPinned}
            className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-30 ${
              isPinned
                ? "text-[var(--color-brand-400)] hover:bg-overlay-default"
                : "text-text-muted opacity-0 group-hover/grouprow:opacity-100 hover:text-text-secondary hover:bg-overlay-default"
            }`}
            style={{ transition: "opacity 120ms, color 120ms, background-color 120ms" }}
          >
            <Pin className="h-3 w-3" strokeWidth={1.5} fill={isPinned ? "currentColor" : "none"} />
          </button>
        )}
        {/* Same fixed-width box as the pin button so the backlog label lines up with pinned sprint labels. */}
        {leadingIcon && <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-tertiary">{leadingIcon}</span>}
        {isActive && (
          <Tooltip content="Active sprint">
            <span
              aria-label="Active sprint"
              className="flex h-2 w-2 shrink-0 rounded-full bg-[var(--color-status-success)]"
              style={{ boxShadow: "0 0 6px color-mix(in srgb, var(--color-status-success) 60%, transparent)" }}
            />
          </Tooltip>
        )}
        {label && (
          sprint?.goal ? (
            <Tooltip content={goalTooltip(sprint.goal)} className="min-w-0">
              <span className="truncate text-body-sm font-semibold text-text-secondary">{label}</span>
            </Tooltip>
          ) : (
            <span className="truncate text-body-sm font-semibold text-text-secondary">{label}</span>
          )
        )}
      </div>
      <StatPill size="sm" variant="default">
        {liveTickets.length} {pluralize(liveTickets.length, "item")}
      </StatPill>
      {showMetrics && totalPoints > 0 && (
        <MetricBadge
          metric="sp"
          value={totalPoints}
          tinted
          activeSortDir={sortField === "points" ? sortDir : undefined}
          dimmed={spColumnHidden}
          onClick={metricInteractive ? () => handleMetricClick("sp") : undefined}
          onDoubleClick={metricInteractive ? () => handleMetricDoubleClick("sp") : undefined}
          tooltipContent={
            metricInteractive
              ? metricActionTooltip("Story points", totalPoints, showBvAvg ? spAvg : null, "per estimated ticket", getSpColor(totalPoints).solid, spColumnHidden)
              : showBvAvg && spAvg
                ? metricTooltip("Story points", totalPoints, spAvg, "per estimated ticket", getSpColor(totalPoints).solid)
                : undefined
          }
        />
      )}
      {showMetrics && bvTickets.length > 0 && (
        <MetricBadge
          metric="bv"
          value={bvTotal}
          tinted
          activeSortDir={sortField === "bv" ? sortDir : undefined}
          dimmed={bvColumnHidden}
          onClick={metricInteractive ? () => handleMetricClick("bv") : undefined}
          onDoubleClick={metricInteractive ? () => handleMetricDoubleClick("bv") : undefined}
          tooltipContent={
            metricInteractive
              ? metricActionTooltip("Business value", bvTotal, showBvAvg ? bvAvg : null, "per scored ticket", getBvColor(bvTotal).solid, bvColumnHidden)
              : showBvAvg && bvAvg
                ? metricTooltip("Business value", bvTotal, bvAvg, "per scored ticket", getBvColor(bvTotal).solid)
                : undefined
          }
        />
      )}
      {planningOn && onPencilCapacityChange && (!isActive || capacityMeterShown) && (
        <FullnessMeter
          used={usedPointsOverride ?? usedEffective}
          capacity={pencilCapacity}
          // With an override (epic view), the group's own tickets are this epic's share
          // of the sprint, so the bar can split it from the rest of the sprint's load.
          ownUsed={usedPointsOverride != null ? usedEffective : undefined}
          onCapacityChange={onPencilCapacityChange}
        />
      )}
      {/* The per-status breakdown is the first thing to drop when the bar gets cramped:
          below the container-query width it hides as a group (items/SP/BV/warning stay).
          `contents` keeps the pills as direct flex children so the gap spacing is unchanged
          when shown. */}
      {showStatusBreakdown && (
        <div className="hidden @4xl:contents">
          {todoCount > 0 && (
            <StatusPill
              size="badge"
              colorKey="TO DO"
              label="TO DO"
              count={todoCount}
              showDot={showDot}
              active={isCriterionActive("todo")}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("todo"); } : undefined}
            />
          )}
          {inProgressCount > 0 && (
            <StatusPill
              size="badge"
              colorKey="IN PROGRESS"
              label="IN PROGRESS"
              count={inProgressCount}
              showDot={showDot}
              active={isCriterionActive("in-progress")}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("in-progress"); } : undefined}
            />
          )}
          {testCount > 0 && (
            <StatusPill
              size="badge"
              colorKey="TEST"
              label="TEST"
              count={testCount}
              showDot={showDot}
              active={isCriterionActive("test")}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("test"); } : undefined}
            />
          )}
          {doneCount > 0 && (
            <StatusPill
              size="badge"
              colorKey="DONE"
              label="DONE"
              count={doneCount}
              showDot={showDot}
              active={isCriterionActive("done")}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("done"); } : undefined}
            />
          )}
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {warningLabel && (
          <Tooltip
            content={
              <div className="flex flex-col gap-1.5">
                {warningParts.map((part) => (
                  <span key={part} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-status-warning)]" aria-hidden />
                    {part}
                  </span>
                ))}
              </div>
            }
          >
            <button
              type="button"
              aria-label={warningParts.join("; ")}
              onClick={canFilterWarnings ? (e) => { e.stopPropagation(); toggle("unpointed"); } : undefined}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-status-warning)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                canFilterWarnings ? "cursor-pointer" : "cursor-default"
              } ${
                activeCriterion === "unpointed"
                  ? "bg-[var(--color-status-warning-subtle)]"
                  : "hover:bg-[var(--color-status-warning-subtle)]"
              }`}
              style={{ transition: "background-color 0.12s ease" }}
            >
              <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        )}
        {syncState === "running" && (
          <Tooltip content={syncTooltip}>
            <span
              role="status"
              aria-label={syncTooltip}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--color-brand-400)]"
            >
              <RefreshCw size={13} strokeWidth={2} className="motion-safe:animate-spin" aria-hidden />
            </span>
          </Tooltip>
        )}
        {updatesAction}
        {createAction}
        {showSprintMenu && (
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const opening = !detailsOpen;
                setDetailsOpen(opening);
                // Clear a finished result when reopening so the menu reads fresh; never
                // interrupt an in-flight sync.
                if (opening && syncState !== "running") {
                  setSyncState("idle");
                  setSyncProgress(null);
                  setSyncResult(null);
                }
              }}
              title={menuKind === "epic" ? "Epic options" : "Sprint options"}
              aria-label={menuKind === "epic" ? "Epic options" : "Sprint options"}
              aria-haspopup="menu"
              aria-expanded={detailsOpen}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                detailsOpen
                  ? "bg-overlay-strong text-text-secondary"
                  : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.12s ease, color 0.12s ease" }}
            >
              <MoreHorizontal size={14} strokeWidth={2} aria-hidden />
            </button>
            <SprintDetailsPopover
              kind={menuKind}
              open={detailsOpen}
              onClose={() => setDetailsOpen(false)}
              canSync={onSync != null}
              syncState={syncState}
              syncProgress={syncProgress}
              syncResult={syncResult}
              onRunSync={runSync}
              anchorRef={menuButtonRef}
              {...(sprint != null
                ? {
                    sprint,
                    jiraUrl: getJiraSprintUrl(sprint.id),
                    onEdit: onEditSprintDetails ? () => onEditSprintDetails() : undefined,
                    onCloseSprint: onCloseSprint ? () => onCloseSprint() : undefined,
                    onStartSprint: onStartSprint ? () => onStartSprint() : undefined,
                    onToggleCapacityMeter: planningOn && onToggleCapacityMeter ? () => onToggleCapacityMeter() : undefined,
                    capacityMeterShown,
                  }
                : {})}
            />
          </div>
        )}
      </div>
    </div>
  );
});
