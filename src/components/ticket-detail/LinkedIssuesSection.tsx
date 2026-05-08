"use client";

import Link from "next/link";
import type { TicketDetail } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";

export function LinkedIssuesSection({ issues }: { issues: TicketDetail["linkedIssues"] }) {
  if (issues.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Linked Issues" />
        <p className="mt-3 text-sm text-text-muted">No linked items</p>
      </div>
    );
  }

  const grouped = issues.reduce<Record<string, typeof issues>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  return (
    <div className="mt-8">
      <SectionHeader title="Linked Issues" count={issues.length} />
      <div className="mt-3 space-y-4">
        {Object.entries(grouped).map(([relation, items]) => (
          <div key={relation}>
            <div className="mb-2 text-label font-medium uppercase tracking-wider text-text-muted">
              {relation}
            </div>
            <div className="overflow-hidden rounded-lg border border-border-default">
              {items.map((item, idx) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    idx < items.length - 1 ? "border-b border-border-subtle" : ""
                  }`}
                >
                  <IssueTypeIcon type={item.type} size={14} />
                  <Link
                    href={`/tickets/${item.key}`}
                    className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.key}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{item.title}</span>
                  <StatusBadge status={item.jiraStatus} />
                  <Avatar assignee={item.assignee} size={22} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
