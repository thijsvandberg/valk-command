"use client";

import { useMemo } from "react";
import type { EpicChildTicket } from "@/app/api/epics/[key]/tickets/route";
import { useEpicTickets } from "@/hooks/useEpics";
import { categorizeStatus, type ProgressCategory } from "@/lib/epic-progress";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Avatar } from "@/components/shared/Avatar";
import { MetricBadge } from "@/components/shared/MetricBadge";

interface SprintMeta {
  id: number;
  name: string;
}

const GROUPS: { category: ProgressCategory; label: string; color: string }[] = [
  { category: "in-progress", label: "In Progress", color: "var(--color-status-progress)" },
  { category: "todo", label: "To Do", color: "var(--color-status-neutral)" },
  { category: "done", label: "Done", color: "var(--color-status-done)" },
];

function TicketRow({ ticket, sprintName }: { ticket: EpicChildTicket; sprintName: string | null }) {
  return (
    <div className="group/row flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-hover-list-item">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TicketStatusPill
          ticketKey={ticket.key}
          jiraStatus={ticket.jiraStatus}
          issueType={ticket.type}
          title={ticket.title}
          variant="list"
          showReadiness={false}
        />
        <span className="truncate text-body-sm text-text-secondary">{ticket.title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <MetricBadge metric="sp" value={ticket.storyPoints} />
        {sprintName && (
          <span className="hidden rounded bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary sm:inline">
            {sprintName}
          </span>
        )}
        <Avatar assignee={ticket.assignee} size={20} />
      </div>
    </div>
  );
}

export function EpicTicketList({ epicKey, sprints }: { epicKey: string; sprints: SprintMeta[] }) {
  const { data, isLoading } = useEpicTickets(epicKey, true);

  const sprintNameById = useMemo(
    () => new Map(sprints.map((s) => [String(s.id), s.name])),
    [sprints],
  );

  const grouped = useMemo(() => {
    const map = new Map<ProgressCategory, EpicChildTicket[]>();
    for (const t of data ?? []) {
      const cat = categorizeStatus(t.jiraStatus);
      const list = map.get(cat) ?? [];
      list.push(t);
      map.set(cat, list);
    }
    return map;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-2 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-overlay-subtle" style={{ opacity: 1 - i * 0.25 }} />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <div className="px-3 py-4 text-body-sm text-text-muted">No tickets in the recent sprint window.</div>;
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {GROUPS.map((group) => {
        const items = grouped.get(group.category) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={group.category} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 px-2 pb-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                {group.label}
              </span>
              <span className="text-[10px] font-medium tabular-nums text-text-muted">{items.length}</span>
            </div>
            {items.map((t) => (
              <TicketRow key={t.key} ticket={t} sprintName={t.sprintId ? sprintNameById.get(t.sprintId) ?? null : "Backlog"} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
