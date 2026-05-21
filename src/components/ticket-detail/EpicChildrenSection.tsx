"use client";

import type { TicketDetail } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";

export function EpicChildrenSection({
  items,
  onSelectTicket,
}: {
  items: TicketDetail["epicChildren"];
  onSelectTicket?: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Child Issues" />
        <p className="mt-3 text-sm text-text-muted">No child issues</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Child Issues" count={items.length} />
      <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
        {items.map((child, idx) => (
          <div
            key={child.key}
            className={`flex items-center gap-3 px-3 py-2.5 ${
              onSelectTicket ? "cursor-pointer hover:bg-overlay-subtle" : ""
            } ${idx < items.length - 1 ? "border-b border-border-subtle" : ""}`}
            onClick={onSelectTicket ? (e) => {
              if (e.metaKey || e.ctrlKey) {
                window.open(`/tickets/${child.key}`, "_blank");
                return;
              }
              onSelectTicket(child.key);
            } : undefined}
          >
            <IssueTypeIcon type={child.type} size={14} />
            <span className="font-mono text-xs text-[var(--color-brand-400)]">
              {child.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{child.title}</span>
            <StatusBadge status={child.jiraStatus} />
            <Avatar assignee={child.assignee} size={22} />
          </div>
        ))}
      </div>
    </div>
  );
}
