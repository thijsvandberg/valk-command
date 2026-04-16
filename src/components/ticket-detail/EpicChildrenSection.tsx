"use client";

import Link from "next/link";
import type { TicketDetail } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";

export function EpicChildrenSection({ items }: { items: TicketDetail["epicChildren"] }) {
  if (items.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Child Issues" />
        <p className="mt-3 text-sm text-white/25">No child issues</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Child Issues" count={items.length} />
      <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
        {items.map((child, idx) => (
          <div
            key={child.key}
            className={`flex items-center gap-3 px-3 py-2.5 ${
              idx < items.length - 1 ? "border-b border-white/[0.04]" : ""
            }`}
          >
            <IssueTypeIcon type={child.type} size={14} />
            <Link
              href={`/tickets/${child.key}`}
              className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              onClick={(e) => e.stopPropagation()}
            >
              {child.key}
            </Link>
            <span className="min-w-0 flex-1 truncate text-sm text-white/60">{child.title}</span>
            <StatusBadge status={child.jiraStatus} />
            <Avatar assignee={child.assignee} size={22} />
          </div>
        ))}
      </div>
    </div>
  );
}
