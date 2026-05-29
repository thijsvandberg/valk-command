"use client";

import { memo } from "react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Cloud } from "lucide-react";
import type { LinkSearchResult } from "@/lib/api-client";
import type { IssueType, JiraStatus } from "@/types/ticket";

interface LinkSearchResultRowProps {
  result: LinkSearchResult;
  highlighted: boolean;
  onSelect: (result: LinkSearchResult) => void;
  onHover: () => void;
}

export const LinkSearchResultRow = memo(function LinkSearchResultRow({
  result,
  highlighted,
  onSelect,
  onHover,
}: LinkSearchResultRowProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(result); }}
      onMouseEnter={onHover}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      style={{
        borderLeft: highlighted ? "2px solid var(--color-brand-400)" : "2px solid transparent",
        backgroundColor: highlighted ? "var(--color-overlay-subtle)" : undefined,
        transition: "background-color 80ms, border-color 80ms",
      }}
    >
      <span onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <TicketStatusPill
          ticketKey={result.key}
          jiraStatus={result.status.toUpperCase() as JiraStatus}
          issueType={result.type as IssueType}
          title={result.title}
          variant="list"
          showKey
          showStatus
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{result.title}</span>
      {result.sprintName && (
        <span className="hidden shrink-0 truncate text-caption text-text-muted sm:inline" style={{ maxWidth: 140 }}>
          {result.sprintName}
        </span>
      )}
      {result.source === "jira" && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-status-info) 10%, transparent)", color: "color-mix(in srgb, #93c5fd 80%, transparent)" }}
        >
          <Cloud size={9} strokeWidth={2} />
          Jira
        </span>
      )}
    </button>
  );
});
