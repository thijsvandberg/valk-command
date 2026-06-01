"use client";

import { memo } from "react";
import type { Ticket } from "@/types/ticket";
import { ChevronRight, ChevronDown, Pin, Gauge } from "lucide-react";
import { StatPill, StatusPill } from "./SprintStatPill";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { Tooltip } from "@/components/shared/Tooltip";

export type StatCriterion = "todo" | "in-progress" | "test" | "done" | "unpointed";

export interface GroupStatBarProps {
  tickets: Ticket[];
  label?: string;
  activeCriterion?: StatCriterion | null;
  onFilterChange?: (criterion: StatCriterion | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Show only a colored dot + count for status pills, no label text */
  showDot?: boolean;
  /** When provided, renders a pin toggle next to the label (used to pin a sprint group to the tab bar). */
  onPin?: () => void;
  isPinned?: boolean;
  pinDisabled?: boolean;
}

export const GroupStatBar = memo(function GroupStatBar({
  tickets,
  label,
  activeCriterion = null,
  onFilterChange,
  isCollapsed,
  onToggleCollapse,
  showDot = false,
  onPin,
  isPinned = false,
  pinDisabled = false,
}: GroupStatBarProps) {
  const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const bvTickets = tickets.filter((t) => t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED");
  const bvTotal = bvTickets.reduce((sum, t) => sum + (t.businessValue ?? 0), 0);
  const bvAvg = bvTickets.length > 0 ? (bvTotal / bvTickets.length).toFixed(1) : null;
  const todoCount = tickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = tickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = tickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = tickets.filter((t) => t.jiraStatus === "DONE").length;
  const noPointsCount = tickets.filter((t) => t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike").length;
  const deprecatedWithSp = tickets.filter((t) => t.jiraStatus === "DEPRECATED" && t.storyPoints != null && t.storyPoints > 0).length;

  const isCollapsible = onToggleCollapse !== undefined;

  function toggle(criterion: StatCriterion) {
    onFilterChange?.(activeCriterion === criterion ? null : criterion);
  }

  return (
    <div className="flex items-center gap-2">
      {isCollapsible && (
        isCollapsed
          ? <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
          : <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
      )}
      {label && (
        <span className="text-body-sm font-medium text-text-secondary truncate">{label}</span>
      )}
      {onPin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!pinDisabled || isPinned) onPin(); }}
          disabled={pinDisabled && !isPinned}
          title={isPinned ? "Unpin from sprint bar" : pinDisabled ? "Maximum 8 pinned sprints" : "Pin to sprint bar"}
          aria-label={isPinned ? "Unpin from sprint bar" : "Pin to sprint bar"}
          aria-pressed={isPinned}
          className={`flex shrink-0 items-center justify-center h-5 w-5 rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-30 ${
            isPinned
              ? "text-[var(--color-brand-400)] hover:bg-overlay-default"
              : "text-text-muted opacity-0 group-hover/grouprow:opacity-100 hover:text-text-secondary hover:bg-overlay-default"
          }`}
          style={{ transition: "opacity 120ms, color 120ms, background-color 120ms" }}
        >
          <Pin className="h-3 w-3" strokeWidth={1.5} fill={isPinned ? "currentColor" : "none"} />
        </button>
      )}
      <StatPill size="sm" variant="default" className={label ? "ml-1" : undefined}>
        {tickets.length} items
      </StatPill>
      {totalPoints > 0 && (
        <MetricBadge metric="sp" value={totalPoints} tinted />
      )}
      {bvTickets.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <MetricBadge metric="bv" value={bvTotal} tinted />
          {bvAvg ? (
            <Tooltip content="Average business value per scored ticket">
              <span className="text-caption text-text-muted whitespace-nowrap cursor-default">avg {bvAvg}</span>
            </Tooltip>
          ) : null}
        </span>
      )}
      {noPointsCount > 0 && (
        <StatPill
          size="sm"
          variant="warning"
          active={activeCriterion === "unpointed"}
          onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("unpointed"); } : undefined}
          title={`${noPointsCount} ${noPointsCount === 1 ? "story" : "stories"} without story point estimate (excludes deprecated and N/A)`}
        >
          <span className="inline-flex items-center gap-1">
            <Gauge size={11} strokeWidth={2} aria-hidden />
            {noPointsCount} no SP
          </span>
        </StatPill>
      )}
      {deprecatedWithSp > 0 && (
        <StatPill
          size="sm"
          variant="warning"
          title={`${deprecatedWithSp} deprecated ${deprecatedWithSp === 1 ? "ticket still has" : "tickets still have"} story points assigned`}
        >
          {deprecatedWithSp} DEPR with SP
        </StatPill>
      )}
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
  );
});
