"use client";

import type { StakeholderTicket } from "@/lib/stakeholder-data";

interface TicketGroupProps {
  tickets: StakeholderTicket[];
  showKeys?: boolean;
  showAssignee?: boolean;
}

function StatusDot({ status }: { status: StakeholderTicket["status"] }) {
  const colors: Record<StakeholderTicket["status"], string> = {
    Completed: "bg-emerald-400/80",
    "In Progress": "bg-[var(--color-brand-400)]/80",
    "In Review": "bg-violet-400/80",
    "To Do": "bg-white/20",
    Deprecated: "bg-white/10",
  };
  return <span className={`mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${colors[status]}`} />;
}

function TypeBadge({ type }: { type: StakeholderTicket["type"] }) {
  if (type === "bug") {
    return (
      <span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide bg-red-500/15 text-red-400/70">
        bug
      </span>
    );
  }
  if (type === "spike") {
    return (
      <span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide bg-violet-500/15 text-violet-400/70">
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

export function TicketGroup({ tickets, showKeys = false, showAssignee = false }: TicketGroupProps) {
  if (tickets.length === 0) {
    return <p className="text-sm text-white/25 italic">None</p>;
  }

  const groups = groupByEpic(tickets);

  return (
    <div className="space-y-5">
      {groups.map(([epic, items]) => (
        <div key={epic}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
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
                {showKeys && t.jiraKey && (
                  <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-[10px] font-mono text-white/30">
                    {t.jiraKey}
                  </span>
                )}
                {showAssignee && t.assignee && (
                  <span className="shrink-0 text-xs text-white/30">{t.assignee.name}</span>
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
