"use client";

import { ExternalLink } from "lucide-react";
import type { StakeholderTicket } from "@/lib/stakeholder-data";
import { getJiraUrl } from "@/lib/jira-url";

interface TicketGroupProps {
  tickets: StakeholderTicket[];
  showKeys?: boolean;
  showAssignee?: boolean;
  carriedKeys?: Set<string>;
}

function StatusDot({ status }: { status: StakeholderTicket["status"] }) {
  const colors: Record<StakeholderTicket["status"], string> = {
    Completed: "bg-[var(--color-secondary-400)]/80",
    "In Progress": "bg-[var(--color-brand-400)]/80",
    "In Review": "bg-[var(--color-warning-400)]/80",
    "To Do": "bg-white/20",
    Deprecated: "bg-white/10",
  };
  return <span className={`mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${colors[status]}`} />;
}

// Deterministic color from the first character of the name string
function avatarColor(name: string): string {
  const colors = [
    "bg-[var(--color-brand-600)]/50 text-[var(--color-brand-300)]",
    "bg-[var(--color-secondary-700)]/50 text-[var(--color-secondary-300)]",
    "bg-[var(--color-warning-700)]/50 text-[var(--color-warning-300)]",
    "bg-violet-900/50 text-violet-300",
    "bg-rose-900/50 text-rose-300",
    "bg-sky-900/50 text-sky-300",
  ];
  const code = name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0);
  return colors[code % colors.length];
}

function AssigneeAvatar({ assignee }: { assignee: { name: string; initials: string } }) {
  const colorClass = avatarColor(assignee.name);
  return (
    <span
      title={assignee.name}
      className={`shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold uppercase tracking-wide ${colorClass}`}
    >
      {assignee.initials}
    </span>
  );
}

function TypeBadge({ type }: { type: StakeholderTicket["type"] }) {
  if (type === "bug") {
    return (
      <span className="shrink-0 rounded px-1 py-px text-caption font-semibold uppercase tracking-wide bg-red-500/15 text-red-400/70">
        bug
      </span>
    );
  }
  if (type === "spike") {
    return (
      <span className="shrink-0 rounded px-1 py-px text-caption font-semibold uppercase tracking-wide bg-violet-500/15 text-violet-400/70">
        spike
      </span>
    );
  }
  return null;
}

function groupByEpic(tickets: StakeholderTicket[]): [string, StakeholderTicket[]][] {
  const map = new Map<string, StakeholderTicket[]>();
  for (const t of tickets) {
    const key = t.epic ?? "Other";
    const group = map.get(key) ?? [];
    group.push(t);
    map.set(key, group);
  }
  return Array.from(map.entries());
}

export function TicketGroup({ tickets, showKeys = false, showAssignee = false, carriedKeys }: TicketGroupProps) {
  if (tickets.length === 0) {
    return <p className="text-sm text-white/25 italic">None</p>;
  }

  const groups = groupByEpic(tickets);

  return (
    <div className="space-y-5">
      {groups.map(([epic, items]) => (
        <div key={epic}>
          <div className="mb-2 text-caption font-semibold uppercase tracking-[0.12em] text-white/30">
            {epic}
          </div>
          <ul className="space-y-1.5">
            {items.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 group">
                <StatusDot status={t.status} />
                <span className="flex-1 text-sm leading-snug text-white/75 group-hover:text-white/90 transition-colors duration-100">
                  {t.title}
                </span>
                <TypeBadge type={t.type} />
                {t.jiraKey && (
                  <a
                    href={getJiraUrl(t.jiraKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-[3px] shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-90 transition-opacity duration-100 cursor-pointer"
                    aria-label={`Open ${t.jiraKey} in Jira`}
                  >
                    <ExternalLink size={11} strokeWidth={1.5} className="text-white/60" />
                  </a>
                )}
                {t.jiraKey && carriedKeys?.has(t.jiraKey) && (
                  <span className="shrink-0 rounded px-1 py-px text-caption font-semibold uppercase tracking-wide bg-[var(--color-warning-400)]/15 text-[var(--color-warning-400)]/70">
                    carried
                  </span>
                )}
                {showKeys && t.jiraKey && (
                  <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-caption font-mono text-white/30">
                    {t.jiraKey}
                  </span>
                )}
                {showAssignee && t.assignee && (
                  <AssigneeAvatar assignee={t.assignee} />
                )}
                {t.storyPoints !== null && (
                  <span className="shrink-0 text-xs tabular-nums text-white/20">{t.storyPoints}pt</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
