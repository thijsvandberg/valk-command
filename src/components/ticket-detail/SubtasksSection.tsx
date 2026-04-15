"use client";

import Link from "next/link";
import type { TicketDetail } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";

export function SubtasksSection({ subtasks }: { subtasks: TicketDetail["subtasks"] }) {
  if (subtasks.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Subtasks" />
        <p className="mt-3 text-sm text-white/25">No subtasks</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Subtasks" count={subtasks.length} />
      <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
        {subtasks.map((sub, idx) => {
          const statusColor = JIRA_STATUS_COLORS[sub.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
          return (
            <div
              key={sub.key}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                idx < subtasks.length - 1 ? "border-b border-white/[0.04]" : ""
              }`}
            >
              <IssueTypeIcon type={sub.type} size={14} />
              <Link
                href={`/tickets/${sub.key}`}
                className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                onClick={(e) => e.stopPropagation()}
              >
                {sub.key}
              </Link>
              <span className="min-w-0 flex-1 truncate text-sm text-white/60">{sub.title}</span>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
              >
                {sub.jiraStatus}
              </span>
              <Avatar assignee={sub.assignee} size={22} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
