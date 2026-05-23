"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Ticket, TicketDetail } from "@/types/ticket";
import { getSpColor } from "@/types/ticket";
import { Avatar } from "@/components/shared/Avatar";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { EditableDescription } from "@/components/ticket-detail/EditableDescription";
import { EditableTitle } from "@/components/ticket-detail/EditableTitle";
import { LinkedIssuesSection } from "@/components/ticket-detail/LinkedIssuesSection";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { SessionStoryPointPicker } from "./SessionStoryPointPicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { tickets, jira } from "@/lib/api-client";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ExternalLink,
  ArrowUpRight,
  PenLine,
  MoreHorizontal,
} from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { getJiraUrl } from "@/lib/jira-url";

interface SessionTicketViewProps {
  ticket: Ticket;
  detail: TicketDetail;
  onMutate: () => void;
  subtasksPaneMode?: boolean;
  metadataExpanded?: boolean;
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

function MetadataDetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-sm text-text-secondary">{children}</div>
    </div>
  );
}

function SessionMetadataPanel({
  ticket,
  detail,
}: {
  ticket: Ticket;
  detail: TicketDetail;
}) {
  const { data: sprints } = useJiraSprints();
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    if (!sprintId) return;
    const prev = currentSprintId;
    setCurrentSprintId(sprintId);
    try {
      await jira.moveSprint({ issueKeys: [ticket.key], targetSprintId: sprintId });
    } catch (err) {
      console.error("Failed to move sprint:", err);
      setCurrentSprintId(prev);
    }
  }, [ticket.key, currentSprintId]);

  return (
    <div
      className="mt-4 rounded-xl border border-border-default bg-overlay-subtle/50 px-4 py-3"
      style={{ animation: "fadeInUp 0.15s ease" }}
    >
      <div className="space-y-0.5">
        {detail.reporter && (
          <MetadataDetailRow label="Reporter">
            <div className="flex items-center justify-end gap-2">
              <Avatar assignee={detail.reporter} size={18} />
              <span className="text-xs">{detail.reporter.name}</span>
            </div>
          </MetadataDetailRow>
        )}
        {ticket.assignee && (
          <MetadataDetailRow label="Assignee">
            <div className="flex items-center justify-end gap-2">
              <Avatar assignee={ticket.assignee} size={18} />
              <span className="text-xs">{ticket.assignee.name}</span>
            </div>
          </MetadataDetailRow>
        )}
        <MetadataDetailRow label="Priority">
          <span className="text-xs">{detail.priority}</span>
        </MetadataDetailRow>
        {ticket.epic && (
          <MetadataDetailRow label="Epic">
            <span className="text-xs text-[var(--color-brand-400)]">{ticket.epic}</span>
          </MetadataDetailRow>
        )}
        <MetadataDetailRow label="Sprint">
          <SprintPicker
            value={currentSprintId}
            sprints={sprints ?? []}
            onChange={handleSprintChange}
            align="right"
          />
        </MetadataDetailRow>
        {detail.labels.length > 0 && (
          <MetadataDetailRow label="Labels">
            <div className="flex flex-wrap justify-end gap-1">
              {detail.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-overlay-default px-1.5 py-0.5 text-caption text-text-tertiary"
                >
                  {label}
                </span>
              ))}
            </div>
          </MetadataDetailRow>
        )}
        {detail.components.length > 0 && (
          <MetadataDetailRow label="Components">
            <div className="flex flex-wrap justify-end gap-1">
              {detail.components.map((comp) => (
                <span
                  key={comp}
                  className="rounded-md bg-overlay-default px-1.5 py-0.5 text-caption text-text-tertiary"
                >
                  {comp}
                </span>
              ))}
            </div>
          </MetadataDetailRow>
        )}
        {detail.parent && (
          <MetadataDetailRow label="Parent">
            <a
              href={`/tickets/${detail.parent.key}`}
              target="_blank"
              className="text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)]"
              style={{ transition: "color 0.15s ease" }}
            >
              {detail.parent.key} {detail.parent.title}
            </a>
          </MetadataDetailRow>
        )}
        <MetadataDetailRow label="Created">
          <span className="text-xs" title={formatAbsoluteDate(detail.createdAt)}>
            {relativeDate(detail.createdAt)}
          </span>
        </MetadataDetailRow>
        <MetadataDetailRow label="Updated">
          <span className="text-xs" title={formatAbsoluteDate(detail.updatedAt)}>
            {relativeDate(detail.updatedAt)}
          </span>
        </MetadataDetailRow>
      </div>
    </div>
  );
}

export function HeaderOverflowMenu({
  ticketKey,
  jiraUrl,
}: {
  ticketKey: string;
  jiraUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default text-text-secondary";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center rounded-md p-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title="More actions"
      >
        <MoreHorizontal size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
          style={{ animation: "fadeInUp 0.1s ease" }}
        >
          <a
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <ExternalLink size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
            Open in Jira
          </a>
          <a
            href={`/tickets/${ticketKey}`}
            target="_blank"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <ArrowUpRight size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
            Open in Bridge
          </a>
          <button
            type="button"
            onClick={() => { window.open(`/tickets/${ticketKey}/write`, "_blank"); setOpen(false); }}
            className={itemClass}
          >
            <PenLine size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
            Open Story Writer
          </button>
        </div>
      )}
    </div>
  );
}

export function SessionTicketView({ ticket, detail, onMutate, subtasksPaneMode, metadataExpanded = false }: SessionTicketViewProps) {
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

  return (
    <div className="space-y-0">
      {/* Metadata panel */}
      {metadataExpanded && (
        <SessionMetadataPanel ticket={ticket} detail={detail} />
      )}

      {/* Title (editable) */}
      <EditableTitle
        ticketKey={ticket.key}
        initialTitle={ticket.title}
        onLocalEdit={setHasLocalEdit}
      />

      {/* Description */}
      <EditableDescription
        ticketKey={ticket.key}
        initialDescription={detail.description}
        attachments={detail.attachments}
        onLocalEdit={setHasLocalEdit}
      />

      {/* Confluence pages */}
      <ConfluencePagesSection ticketKey={ticket.key} />

      {/* Linked issues (full edit capabilities) */}
      <LinkedIssuesSection
        issues={detail.linkedIssues}
        ticketKey={ticket.key}
        onMutate={onMutate}
      />

      {/* Comments */}
      <CollapsibleComments ticketKey={ticket.key} jiraComments={detail.jiraComments} />

      {/* Subtasks (hidden when in side pane mode) */}
      {!subtasksPaneMode && (
        <SubtasksSection subtasks={detail.subtasks} ticketKey={ticket.key} onMutate={onMutate} />
      )}

      {/* Story Points */}
      <div className="mt-8 border-t border-border-default pt-6">
        <SessionStoryPointPicker value={storyPoints} onChange={handleStoryPointsChange} />
      </div>
    </div>
  );
}
