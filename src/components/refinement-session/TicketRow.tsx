"use client";

import { Gem } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EditStateDot } from "@/components/sprint-board/TicketTableCells";
import type { Ticket } from "@/types/ticket";
import { getSpColor, getEpicColor, getBvColor } from "@/types/ticket";

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
          hoverData={{
            title: ticket.title,
            storyPoints: ticket.storyPoints,
            businessValue: ticket.businessValue,
            sprintName,
            epic: ticket.epic,
            assignee: ticket.assignee?.name ?? null,
            reporter: null,
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
        <span
          className="rounded-md px-1.5 py-0.5 text-caption font-medium tabular-nums"
          style={{
            color: getBvColor(ticket.businessValue).text,
            backgroundColor: getBvColor(ticket.businessValue).bg,
          }}
        >
          BV: {ticket.businessValue}
        </span>
      )}
      {showSp && ticket.storyPoints != null && (
        <span
          className="rounded-md px-1.5 py-0.5 text-caption font-medium tabular-nums"
          style={{
            color: getSpColor(ticket.storyPoints).text,
            backgroundColor: getSpColor(ticket.storyPoints).bg,
          }}
        >
          {ticket.storyPoints === 0 ? "-" : ticket.storyPoints}
        </span>
      )}
    </div>
  );
}
