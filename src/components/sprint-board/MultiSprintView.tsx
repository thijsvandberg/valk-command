"use client";

import { useState, useMemo } from "react";
import { MOCK_SPRINTS, MOCK_TICKETS, EPIC_COLORS, type Ticket } from "./mock-data";
import { JIRA_STATUS_COLORS } from "../shared/StatusBadge";
import { IssueTypeIcon } from "../shared/IssueTypeIcon";
import { Avatar } from "../shared/Avatar";
import { Search, X } from "lucide-react";

// Simplified table for a single sprint in compare mode
function MiniSprintTable({
  sprintId,
  searchQuery,
}: {
  sprintId: string;
  searchQuery: string;
}) {
  const sprint = MOCK_SPRINTS.find((s) => s.id === sprintId);
  // In a real app, tickets would be filtered by sprint. Using mock data for now.
  const tickets = useMemo(() => {
    let list = MOCK_TICKETS;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.key.toLowerCase().includes(q),
      );
    }
    return list;
  }, [searchQuery]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Sprint header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: sprint?.state === "active" ? "#4aaa60" : sprint?.state === "closed" ? "#94a3b8" : "#60a5fa" }}
        />
        <span className="text-sm font-medium text-white/80">{sprint?.name ?? sprintId}</span>
        {sprint?.dateRange && (
          <span className="text-xs text-white/25">{sprint.dateRange}</span>
        )}
        <span className="text-xs text-white/20">{tickets.length} items</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
            <tr className="border-b border-white/[0.06] text-left text-xs font-medium text-white/30">
              <th className="w-6 py-2 pl-3 pr-1" />
              <th className="w-20 py-2 pr-2">Key</th>
              <th className="py-2 pr-2">Title</th>
              <th className="w-20 py-2 pr-2">Status</th>
              <th className="w-8 py-2 pr-2 text-center">Pts</th>
              <th className="w-8 py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] || JIRA_STATUS_COLORS["TO DO"];
              return (
                <tr
                  key={ticket.key}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                >
                  <td className="py-1.5 pl-3 pr-1">
                    <IssueTypeIcon type={ticket.type} size={14} />
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-[11px] text-white/40">
                    {ticket.key}
                  </td>
                  <td className="max-w-0 truncate py-1.5 pr-2 text-xs text-white/70">
                    {ticket.title}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
                    >
                      {ticket.jiraStatus}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-center text-[11px] tabular-nums text-white/25">
                    {ticket.storyPoints ?? "-"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Avatar assignee={ticket.assignee} size={18} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sprint selector for compare mode
function CompareSprintSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-white/60 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none"
    >
      {MOCK_SPRINTS.map((s) => (
        <option key={s.id} value={s.id} className="bg-[var(--color-surface-base)] text-white">
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function MultiSprintView({
  initialLeft,
  initialRight,
  onClose,
}: {
  initialLeft: string;
  initialRight: string;
  onClose: () => void;
}) {
  const [leftSprint, setLeftSprint] = useState(initialLeft);
  const [rightSprint, setRightSprint] = useState(initialRight);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <span className="text-sm font-medium text-white/60">Compare Sprints</span>
        <div className="flex items-center gap-2">
          <CompareSprintSelector value={leftSprint} onChange={setLeftSprint} />
          <span className="text-xs text-white/20">vs</span>
          <CompareSprintSelector value={rightSprint} onChange={setRightSprint} />
        </div>
        <div className="flex-1" />
        {/* Cross-sprint search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search across sprints..."
            className="w-56 rounded-md border border-white/[0.06] bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
          title="Close compare view"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        <MiniSprintTable sprintId={leftSprint} searchQuery={searchQuery} />
        <div className="w-px shrink-0 bg-white/[0.06]" />
        <MiniSprintTable sprintId={rightSprint} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
