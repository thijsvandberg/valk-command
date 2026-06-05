"use client";

import { memo, useRef, useState, type ReactNode } from "react";
import type { Ticket, Sprint } from "@/types/ticket";
import type { GroupSyncProgress, GroupSyncResult, GroupSyncState } from "@/lib/group-sync";
import { getSpColor, getBvColor } from "@/types/ticket";
import { ChevronRight, ChevronDown, Pin, AlertTriangle, MoreHorizontal, RefreshCw } from "lucide-react";
import { StatPill, StatusPill } from "./SprintStatPill";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Tooltip } from "@/components/shared/Tooltip";
import { SprintDetailsPopover } from "./SprintDetailsPopover";

export type StatCriterion = "todo" | "in-progress" | "test" | "done" | "unpointed";

export interface GroupStatBarProps {
  tickets: Ticket[];
  label?: string;
  /** Optional icon rendered just before the label (e.g. the backlog icon). */
  leadingIcon?: ReactNode;
  activeCriterion?: StatCriterion | null;
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
  /**
   * Runs a tranched sync of this group (sprint or epic) from Jira, reporting
   * progress. When provided, the "..." menu's first level exposes a Sync action.
   */
  onSync?: (onProgress: (progress: GroupSyncProgress) => void) => Promise<GroupSyncResult>;
  /** What the group represents; drives the sync label. Defaults from `sprint`. */
  syncKind?: "sprint" | "epic";
  /** Action pinned into the right cluster between the warning and the "..." menu (e.g. a create "+"). */
  createAction?: ReactNode;
}

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

// Tooltip for the sprint label: a small caption above the goal text so a glance
// reads it as the sprint's goal rather than a stray note.
function goalTooltip(goal: string): ReactNode {
  return (
    <div className="flex max-w-[18rem] flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Sprint goal</span>
      <span className="whitespace-pre-line text-text-primary">{goal}</span>
    </div>
  );
}

export const GroupStatBar = memo(function GroupStatBar({
  tickets,
  label,
  leadingIcon,
  activeCriterion = null,
  onFilterChange,
  isCollapsed,
  onToggleCollapse,
  labelWidthClass = "w-48",
  showDot = false,
  showStatusCounts = true,
  showBvAvg = true,
  onPin,
  isPinned = false,
  pinDisabled = false,
  isActive = false,
  sprint,
  onEditSprintDetails,
  onCloseSprint,
  onSync,
  syncKind,
  createAction,
}: GroupStatBarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const bvTickets = tickets.filter((t) => t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED");
  const bvTotal = bvTickets.reduce((sum, t) => sum + (t.businessValue ?? 0), 0);
  const bvAvg = bvTickets.length > 0 ? (bvTotal / bvTickets.length).toFixed(1) : null;
  // Average effort per estimated (pointed, non-deprecated) ticket, surfaced on the SP badge hover.
  const spTickets = tickets.filter((t) => t.storyPoints != null && t.storyPoints > 0 && t.jiraStatus !== "DEPRECATED");
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
  const todoCount = tickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = tickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = tickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = tickets.filter((t) => t.jiraStatus === "DONE").length;
  const noPointsCount = tickets.filter((t) => t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike").length;
  const deprecatedWithSp = tickets.filter((t) => t.jiraStatus === "DEPRECATED" && t.storyPoints != null && t.storyPoints > 0).length;
  // A story that is closed (Done/Deprecated) while subtasks remain open is a
  // hygiene gap: the parent reads as finished but work is still outstanding.
  const closedWithOpenSubtasks = tickets.filter(
    (t) => (t.jiraStatus === "DONE" || t.jiraStatus === "DEPRECATED") && (t.openSubtaskCount ?? 0) > 0,
  ).length;
  // When every ticket shares the same status, the per-status pill just echoes the "X items"
  // count, so suppress the breakdown to cut noise (e.g. an all-TO DO sprint).
  const showStatusBreakdown = showStatusCounts && new Set(tickets.map((t) => t.jiraStatus)).size > 1;

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

  function toggle(criterion: StatCriterion) {
    onFilterChange?.(activeCriterion === criterion ? null : criterion);
  }

  return (
    <div className="@container flex w-full items-center gap-2">
      {/* Fixed-width label zone so the stats (item count onward) start at the same x
          across every group row, regardless of sprint name length (BRDG-239). */}
      <div className={`flex shrink-0 items-center gap-2 ${label ? `${labelWidthClass} min-w-0` : ""}`}>
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
              <span className="truncate text-body-sm font-medium text-text-secondary">{label}</span>
            </Tooltip>
          ) : (
            <span className="truncate text-body-sm font-medium text-text-secondary">{label}</span>
          )
        )}
      </div>
      <StatPill size="sm" variant="default">
        {tickets.length} items
      </StatPill>
      {totalPoints > 0 && (
        <MetricBadge
          metric="sp"
          value={totalPoints}
          tinted
          tooltipContent={
            showBvAvg && spAvg
              ? metricTooltip("Story points", totalPoints, spAvg, "per estimated ticket", getSpColor(totalPoints).text)
              : undefined
          }
        />
      )}
      {bvTickets.length > 0 && (
        <MetricBadge
          metric="bv"
          value={bvTotal}
          tinted
          tooltipContent={
            showBvAvg && bvAvg
              ? metricTooltip("Business value", bvTotal, bvAvg, "per scored ticket", getBvColor(bvTotal).text)
              : undefined
          }
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
              size="sm"
              colorKey="TO DO"
              label="TO DO"
              count={todoCount}
              showDot={showDot}
              active={activeCriterion === "todo"}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("todo"); } : undefined}
            />
          )}
          {inProgressCount > 0 && (
            <StatusPill
              size="sm"
              colorKey="IN PROGRESS"
              label="IN PROGRESS"
              count={inProgressCount}
              showDot={showDot}
              active={activeCriterion === "in-progress"}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("in-progress"); } : undefined}
            />
          )}
          {testCount > 0 && (
            <StatusPill
              size="sm"
              colorKey="TEST"
              label="TEST"
              count={testCount}
              showDot={showDot}
              active={activeCriterion === "test"}
              onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("test"); } : undefined}
            />
          )}
          {doneCount > 0 && (
            <StatusPill
              size="sm"
              colorKey="DONE"
              label="DONE"
              count={doneCount}
              showDot={showDot}
              active={activeCriterion === "done"}
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
                    onEdit: onEditSprintDetails ? () => onEditSprintDetails() : undefined,
                    onCloseSprint: onCloseSprint ? () => onCloseSprint() : undefined,
                  }
                : {})}
            />
          </div>
        )}
      </div>
    </div>
  );
});
