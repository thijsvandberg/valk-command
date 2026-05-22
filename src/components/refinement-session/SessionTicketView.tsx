"use client";

import { useState, useCallback, useMemo } from "react";
import type { Ticket, TicketDetail, LinkedIssue } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { EditableDescription, resolveLocalValue } from "@/components/ticket-detail/EditableDescription";
import { SessionStoryPointPicker } from "./SessionStoryPointPicker";
import { tickets } from "@/lib/api-client";
import { ChevronDown, ChevronRight, MessageSquare, Link2 } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";

interface SessionTicketViewProps {
  ticket: Ticket;
  detail: TicketDetail;
  onMutate: () => void;
}

function CompactRelations({ issues }: { issues: LinkedIssue[] }) {
  const grouped = useMemo(() => {
    return issues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
      if (!acc[issue.relation]) acc[issue.relation] = [];
      acc[issue.relation].push(issue);
      return acc;
    }, {});
  }, [issues]);

  if (issues.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <Link2 size={13} strokeWidth={1.5} className="text-text-muted" />
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
          Relations
        </h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {issues.length}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {Object.entries(grouped).map(([relation, items]) => (
          <div key={relation}>
            <div className="mb-1.5 text-label font-medium uppercase tracking-wider text-text-muted">
              {relation}
            </div>
            <div className="space-y-0.5">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-overlay-subtle"
                  style={{ transition: "background-color 0.1s ease" }}
                >
                  <IssueTypeIcon type={item.type} size={13} />
                  <span className="font-mono text-xs text-[var(--color-brand-400)]">{item.key}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{item.title}</span>
                  <StatusBadge status={item.jiraStatus} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleComments({
  ticketKey,
  jiraComments,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
}) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = jiraComments.length;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 border-b border-border-default pb-2 text-left"
      >
        <MessageSquare size={13} strokeWidth={1.5} className="text-text-muted" />
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
          Comments
        </h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {totalCount}
        </span>
        <span className="ml-auto text-text-muted">
          {expanded ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
      </button>
      {expanded && totalCount > 0 && (
        <div className="mt-3 space-y-3">
          {[...jiraComments].reverse().map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-white"
                style={{ backgroundColor: comment.authorColor }}
              >
                {comment.authorInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-secondary">{comment.authorName}</span>
                  <span className="text-caption text-text-muted">
                    {new Date(comment.createdAt).toLocaleString("nl-NL", { hour12: false })}
                  </span>
                </div>
                <div className="description-content mt-1 text-xs leading-[1.7] text-text-tertiary">
                  {renderMarkdown(comment.content)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {expanded && totalCount === 0 && (
        <p className="mt-3 text-xs text-text-muted">No comments</p>
      )}
    </div>
  );
}

export function SessionTicketView({ ticket, detail, onMutate }: SessionTicketViewProps) {
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [hasLocalEdit, setHasLocalEdit] = useState(false);

  const handleStoryPointsChange = useCallback(
    async (v: number | null) => {
      const prev = storyPoints;
      setStoryPoints(v);
      try {
        await tickets.updateStoryPoints(ticket.key, v);
        onMutate();
      } catch (err) {
        console.error("Failed to update story points:", err);
        setStoryPoints(prev);
      }
    },
    [ticket.key, storyPoints, onMutate],
  );

  const readinessCfg = ticket.readiness ? READINESS_CONFIG[ticket.readiness] : null;

  return (
    <div className="space-y-0">
      {/* Ticket header */}
      <div className="mb-6 flex items-center gap-3">
        <IssueTypeIcon type={ticket.type} size={18} />
        <span className="font-mono text-sm font-medium text-[var(--color-brand-400)]">{ticket.key}</span>
        <StatusBadge status={ticket.jiraStatus} />
        {readinessCfg && (
          <span
            className="rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ color: readinessCfg.color, backgroundColor: readinessCfg.bg }}
          >
            {readinessCfg.label}
          </span>
        )}
        {ticket.assignee && (
          <div className="ml-auto flex items-center gap-2">
            <Avatar assignee={ticket.assignee} size={22} />
            <span className="text-xs text-text-tertiary">{ticket.assignee.name}</span>
          </div>
        )}
      </div>

      {/* Title */}
      <h1 className="font-[var(--font-display)] text-heading-lg font-bold tracking-[-0.03em] text-text-primary leading-tight">
        {ticket.title}
      </h1>

      {/* Description */}
      <EditableDescription
        ticketKey={ticket.key}
        initialDescription={detail.description}
        attachments={detail.attachments}
        onLocalEdit={setHasLocalEdit}
      />

      {/* Relations */}
      <CompactRelations issues={detail.linkedIssues} />

      {/* Comments */}
      <CollapsibleComments ticketKey={ticket.key} jiraComments={detail.jiraComments} />

      {/* Subtasks */}
      <SubtasksSection subtasks={detail.subtasks} ticketKey={ticket.key} onMutate={onMutate} />

      {/* Story Points */}
      <div className="mt-8 border-t border-border-default pt-6">
        <SessionStoryPointPicker value={storyPoints} onChange={handleStoryPointsChange} />
      </div>
    </div>
  );
}
