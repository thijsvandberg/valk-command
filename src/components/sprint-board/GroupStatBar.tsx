"use client";

import type { Ticket } from "@/types/ticket";
import { ChevronRight, ChevronDown } from "lucide-react";
import { StatPill, StatusPill } from "./SprintStatPill";

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
}

export function GroupStatBar({
  tickets,
  label,
  activeCriterion = null,
  onFilterChange,
  isCollapsed,
  onToggleCollapse,
  showDot = false,
}: GroupStatBarProps) {
  const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const bvTickets = tickets.filter((t) => t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED");
  const bvTotal = bvTickets.reduce((sum, t) => sum + (t.businessValue ?? 0), 0);
  const bvAvg = bvTickets.length > 0 ? (bvTotal / bvTickets.length).toFixed(1) : null;
  const todoCount = tickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = tickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = tickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = tickets.filter((t) => t.jiraStatus === "DONE").length;
  const noPointsCount = tickets.filter((t) => !t.storyPoints).length;

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
        <span className="text-xs font-medium text-text-secondary truncate">{label}</span>
      )}
      <StatPill size="sm" variant="default" className={label ? "ml-1" : undefined}>
        {tickets.length} items
      </StatPill>
      {totalPoints > 0 && (
        <StatPill size="sm" variant="dim">{totalPoints} pts</StatPill>
      )}
      {bvTickets.length > 0 && (
        <StatPill size="sm" variant="dim">BV: {bvTotal}{bvAvg ? ` avg ${bvAvg}` : ""}</StatPill>
      )}
      {noPointsCount > 0 && (
        <StatPill
          size="sm"
          variant="warning"
          active={activeCriterion === "unpointed"}
          onClick={onFilterChange ? (e) => { e.stopPropagation(); toggle("unpointed"); } : undefined}
        >
          {noPointsCount} no pts
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
}
