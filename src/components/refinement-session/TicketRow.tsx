"use client";

import { Gem } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EditStateDot } from "@/components/sprint-board/TicketTableCells";
import type { Ticket, Sprint } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import { MetricBadge } from "@/components/shared/MetricBadge";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";

export interface TicketRowProps {
  ticket: Ticket;
  selected: boolean;
  onToggle: (key: string, index: number, shiftKey: boolean) => void;
  sprintName: string | null;
  index: number;
  sessionNames?: string[];
  isOtherSession?: boolean;
  showIssueType?: boolean;
  showKey?: boolean;
  showStatus?: boolean;
  showEpic?: boolean;
  showSubtasks?: boolean;
  showSp?: boolean;
  showBv?: boolean;
  showSprint?: boolean;
  sprints?: Sprint[];
  onAssigneeChange?: (key: string, user: AssignableUser | null) => void;
  onEpicChange?: (key: string, epic: EpicOption | null) => void;
  onSprintChange?: (key: string, sprintId: string | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
}

export function TicketRow({
  ticket,
  selected,
  onToggle,
  sprintName,
  index,
  sessionNames,
  isOtherSession,
  showIssueType = true,
  showKey = true,
  showStatus = true,
  showEpic = true,
  showSubtasks = true,
  showSp = true,
  showBv = true,
  showSprint = true,
  sprints,
  onAssigneeChange,
  onEpicChange,
  onSprintChange,
  onStoryPointsChange,
  onBusinessValueChange,
}: TicketRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onToggle(ticket.key, index, e.shiftKey)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(ticket.key, index, e.shiftKey); } }}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        selected
          ? "bg-[var(--color-brand-500)]/[0.08] border border-[var(--color-brand-500)]/20"
          : "hover:bg-overlay-subtle border border-transparent"
      }`}
      style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-600)]"
            : "border-border-strong bg-overlay-subtle"
        }`}
        style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <TicketStatusPill
          ticketKey={ticket.key}
          jiraStatus={ticket.jiraStatus}
          issueType={showIssueType ? ticket.type : undefined}
          title={ticket.title}
          readiness={ticket.readiness}
          variant="list"
          showKey={showKey}
          showStatus={showStatus}
          sprints={sprints}
          onAssigneeChange={onAssigneeChange ? (u) => onAssigneeChange(ticket.key, u) : undefined}
          onEpicChange={onEpicChange ? (e) => onEpicChange(ticket.key, e) : undefined}
          onSprintChange={onSprintChange ? (s) => onSprintChange(ticket.key, s) : undefined}
          onStoryPointsChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : undefined}
          onBusinessValueChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : undefined}
          hoverData={{
            title: ticket.title,
            storyPoints: ticket.storyPoints,
            businessValue: ticket.businessValue,
            sprintId: sprints?.find((s) => s.name === ticket.sprintId)?.id ?? null,
            sprintName,
            epicKey: ticket.epicKey,
            epic: ticket.epic,
            assignee: ticket.assignee ?? null,
            reporter: ticket.reporter ?? null,
            openSubtaskCount: ticket.openSubtaskCount ?? 0,
            totalSubtaskCount: ticket.totalSubtaskCount ?? 0,
            flagged: ticket.flagged,
          }}
        />
      </span>
      {ticket.editState === "draft" && <EditStateDot state="draft" />}
      {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
      {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
      <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">{ticket.title}</span>
      {showEpic && ticket.epic && (
        <span
          className="shrink-0 truncate max-w-[140px] rounded-md px-1.5 py-0.5 text-caption font-medium"
          style={{
            backgroundColor: getEpicColor(ticket.epic).bg,
            color: getEpicColor(ticket.epic).text,
          }}
        >
          {ticket.epic}
        </span>
      )}
      {showSubtasks && (ticket.totalSubtaskCount ?? 0) > 0 && (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-muted">
          {ticket.openSubtaskCount ?? 0}/{ticket.totalSubtaskCount}
        </span>
      )}
      {sessionNames && sessionNames.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-brand-500)]/[0.08] px-1.5 py-0.5 text-caption font-medium text-[var(--color-brand-400)]">
          <Gem size={9} strokeWidth={1.5} />
          {sessionNames.join(", ")}
        </span>
      )}
      {selected && isOtherSession && (
        <span className="shrink-0 text-[11px] text-amber-400/70">
          In other session
        </span>
      )}
      {showSprint && sprintName && (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-muted">
          {sprintName}
        </span>
      )}
      {showBv && ticket.businessValue != null && ticket.businessValue > 0 && (
        <span className="shrink-0"><MetricBadge metric="bv" value={ticket.businessValue} tinted size="xs" /></span>
      )}
      {showSp && ticket.storyPoints != null && (
        <span className="shrink-0"><MetricBadge metric="sp" value={ticket.storyPoints} tinted size="xs" /></span>
      )}
    </div>
  );
}
