"use client";

import { useState, useCallback, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useUser } from "@clerk/nextjs";
import type { Ticket, TicketDetail } from "@/types/ticket";

import { Avatar } from "@/components/shared/Avatar";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { EditableDescription } from "@/components/ticket-detail/EditableDescription";
import { EditableTitle } from "@/components/ticket-detail/EditableTitle";
import { LinkedIssuesSection } from "@/components/ticket-detail/LinkedIssuesSection";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { AttachmentsSection } from "@/components/ticket-detail/AttachmentsSection";

import { SprintPicker } from "@/components/shared/SprintPicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";
import { tickets, jira } from "@/lib/api-client";
import { patchTicketCaches, revalidateTicketCaches } from "@/lib/ticket-cache";
import { useSectionCollapsed } from "@/hooks/useSectionCollapsed";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ExternalLink,
  ArrowUpRight,
  PenLine,
  MoreHorizontal,
  Send,
  Check,
} from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { getJiraUrl } from "@/lib/jira-url";

interface SessionTicketViewProps {
  ticket: Ticket;
  detail: TicketDetail;
  onMutate: () => void;
  subtasksPaneMode?: boolean;
  localEdits?: Record<string, { value: string; isDraft: boolean }>;
  showConflictWarning?: boolean;
  overrideConfirmed?: boolean;
  onOverrideChange?: (val: boolean) => void;
  isPushing?: boolean;
  pushError?: string | null;
  onPushToJira?: () => Promise<void>;
  onDiscard?: () => void;
  onLocalTitleEdit?: (has: boolean) => void;
  onLocalDescEdit?: (has: boolean) => void;
  onViewDiff?: () => void;
}

function CollapsibleComments({
  ticketKey,
  jiraComments,
  onMutate,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
  onMutate?: () => void;
}) {
  // Comments collapse is shared with the full-view "Jira Comments" section so the
  // PO's choice persists across every surface, not just this session.
  const { isCollapsed, toggle } = useSectionCollapsed();
  const expanded = !isCollapsed(SECTION_KEYS.jiraComments);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { user } = useUser();
  const totalCount = jiraComments.length;

  const userInitials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
    : "";
  const hasUserImage = !!user?.imageUrl;

  const handlePost = useCallback(async (content?: string) => {
    const text = (content ?? newComment).trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await tickets.addJiraComment(ticketKey, { content: text });
      setNewComment("");
      setPosted(true);
      onMutate?.();
      clearTimeout(postedTimerRef.current);
      postedTimerRef.current = setTimeout(() => setPosted(false), 2500);
    } catch {
      setError("Failed to post comment");
    } finally {
      setPosting(false);
    }
  }, [ticketKey, newComment, posting, onMutate]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => toggle(SECTION_KEYS.jiraComments)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 border-b border-border-default pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <MessageSquare size={13} strokeWidth={1.5} className="text-text-muted" />
        <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
          Comments
        </h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {totalCount}
        </span>
        <span className="ml-auto text-text-muted">
          {expanded ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Comment input with user avatar */}
          <div className="flex gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden"
              style={{
                backgroundColor: hasUserImage ? "transparent" : "var(--color-brand-600)",
              }}
            >
              {hasUserImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-[10px] font-semibold text-white">
                  {userInitials}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="relative">
                <textarea
                  value={newComment}
                  onChange={(e) => { setNewComment(e.target.value); setError(null); }}
                  placeholder="Post a comment to Jira..."
                  rows={2}
                  disabled={posting}
                  className="w-full resize-none rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 pr-10 text-body-sm text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handlePost();
                    }
                  }}
                />
                {newComment.trim() && (
                  <button
                    type="button"
                    onClick={() => handlePost()}
                    disabled={posting}
                    className="absolute right-2 bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                    title="Post to Jira (Cmd+Enter)"
                    aria-label="Post comment to Jira"
                  >
                    <Send size={12} strokeWidth={2} />
                  </button>
                )}
              </div>
              {posted && (
                <div
                  className="mt-1.5 flex items-center gap-1.5 text-caption text-[var(--color-brand-400)]"
                  style={{ animation: "fadeInUp 0.15s ease" }}
                >
                  <Check size={13} strokeWidth={2} />
                  <span>Comment posted to Jira</span>
                </div>
              )}
              {error && (
                <p className="mt-1.5 text-caption text-[var(--color-status-error)]">{error}</p>
              )}
            </div>
          </div>

          {/* Existing comments */}
          {[...jiraComments].reverse().map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-white"
                style={{ backgroundColor: comment.authorColor }}
              >
                {comment.authorInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-medium text-text-secondary">{comment.authorName}</span>
                  <span className="text-caption text-text-muted">
                    {new Date(comment.createdAt).toLocaleString("nl-NL", { hour12: false })}
                  </span>
                </div>
                <div className="description-content mt-1 text-body-sm leading-[1.7] text-text-tertiary">
                  {renderMarkdown(comment.content, { linkifyRefs: true })}
                </div>
              </div>
            </div>
          ))}

          {totalCount === 0 && !newComment.trim() && !posted && (
            <p className="pl-10 text-body-sm text-text-muted">No Jira comments</p>
          )}
        </div>
      )}
    </div>
  );
}

function MetadataDetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-sm text-text-secondary">{children}</div>
    </div>
  );
}

function CompactField({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-lg border border-border-subtle px-3 py-2"
      style={{
        backgroundColor: accent ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))" : "var(--color-overlay-subtle)",
        transition: "background-color 0.15s ease",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">{label}</span>
        <div className="text-body-lg text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

export function SessionMetadataPanel({
  ticket,
  detail,
  onMutate,
}: {
  ticket: Ticket;
  detail: TicketDetail;
  onMutate?: () => void;
}) {
  const { sprints } = useJiraSprints();
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [assignee, setAssignee] = useState(ticket.assignee);
  const [epicName, setEpicName] = useState<string | null>(ticket.epic);
  const [epicKey, setEpicKey] = useState<string | null>(ticket.epicKey);
  const [labels, setLabels] = useState<string[]>(() => detail.labels ?? []);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    const prev = storyPoints;
    setStoryPoints(v);
    // The wrap-up modal and ticket lists read from the shared /api/tickets
    // caches, which only refresh on their own interval; patch them so the
    // chosen estimate is visible there immediately, then revalidate to pick
    // up the server-owned readiness transition.
    patchTicketCaches(ticket.key, { storyPoints: v });
    try {
      await tickets.updateStoryPoints(ticket.key, v);
      onMutate?.();
      revalidateTicketCaches();
    } catch (err) {
      console.error("Operation failed:", err);
      setStoryPoints(prev);
      patchTicketCaches(ticket.key, { storyPoints: prev });
    }
  }, [ticket.key, storyPoints, onMutate]);

  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    setBusinessValue(v);
    try {
      await tickets.updateMetadata(ticket.key, { businessValue: v });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key, onMutate]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    if (!sprintId) return;
    const prev = currentSprintId;
    setCurrentSprintId(sprintId);
    try {
      await jira.moveSprint({ issueKeys: [ticket.key], targetSprintId: sprintId });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setCurrentSprintId(prev);
    }
  }, [ticket.key, currentSprintId, onMutate]);

  const handleAssigneeChange = useCallback(async (user: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => {
    const prev = assignee;
    if (user) {
      const name = user.displayName;
      const parts = name.trim().split(/\s+/);
      const initials = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
      const hue = ((hash % 360) + 360) % 360;
      setAssignee({ name, initials, color: `hsl(${hue}, 55%, 50%)` });
    } else {
      setAssignee(null);
    }
    try {
      await jira.assign({
        issueKey: ticket.key,
        accountId: user?.accountId ?? null,
        name: user?.displayName ?? null,
      });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setAssignee(prev);
    }
  }, [ticket.key, assignee, onMutate]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    const prevName = epicName;
    const prevKey = epicKey;
    setEpicName(epic?.name ?? null);
    setEpicKey(epic?.key ?? null);
    try {
      await tickets.updateEpic(ticket.key, epic?.key ?? null);
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setEpicName(prevName);
      setEpicKey(prevKey);
    }
  }, [ticket.key, epicName, epicKey, onMutate]);

  const handleLabelsChange = useCallback(async (newLabels: string[]) => {
    const prev = labels;
    setLabels(newLabels);
    try {
      await tickets.updateLabels(ticket.key, newLabels);
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setLabels(prev);
    }
  }, [ticket.key, labels, onMutate]);

  const statusColors = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];

  return (
    <div
      className="mt-4 space-y-3"
      style={{ animation: "fadeInUp 0.15s ease" }}
    >
      {/* Story Points + Business Value compact row */}
      <div className="grid grid-cols-2 gap-2">
        <CompactField label="Story Points" accent={storyPoints !== null}>
          <StoryPointPicker value={storyPoints} onChange={handleStoryPointsChange} showMetricIcon richTooltip />
        </CompactField>
        <CompactField label="Business Value" accent={businessValue !== null}>
          <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="right" showMetricIcon richTooltip />
        </CompactField>
      </div>

      {/* Metadata rows */}
      <div className="rounded-xl border border-border-default bg-overlay-subtle/50 px-4 py-3">
        <div className="space-y-0">
          <MetadataDetailRow label="Status">
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-body-sm font-medium"
              style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
            >
              {ticket.jiraStatus}
            </span>
          </MetadataDetailRow>
          {ticket.type !== "epic" && ticket.type !== "subtask" && (
            <MetadataDetailRow label="Epic">
              <EpicPicker
                value={epicKey ? { key: epicKey, name: epicName ?? epicKey } : null}
                onChange={handleEpicChange}
                align="right"
                ticketKey={ticket.key}
                textClass="text-body-sm"
              />
            </MetadataDetailRow>
          )}
          {detail.parent && (
            <MetadataDetailRow label="Parent">
              <a
                href={`/tickets/${detail.parent.key}`}
                target="_blank"
                className="text-body-sm text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] cursor-pointer"
                style={{ transition: "color 0.15s ease" }}
              >
                {detail.parent.key} {detail.parent.title}
              </a>
            </MetadataDetailRow>
          )}
          <MetadataDetailRow label="Sprint">
            <SprintPicker
              value={currentSprintId}
              sprints={sprints ?? []}
              onChange={handleSprintChange}
              align="right"
              textClass="text-body-sm"
            />
          </MetadataDetailRow>
          <MetadataDetailRow label="Assignee">
            <AssigneePicker
              value={assignee}
              onChange={handleAssigneeChange}
              align="right"
              textClass="text-body-sm"
            />
          </MetadataDetailRow>
          {detail.reporter && (
            <MetadataDetailRow label="Reporter">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{detail.reporter.name}</span>
                <Avatar assignee={detail.reporter} size={20} />
              </div>
            </MetadataDetailRow>
          )}
          <MetadataDetailRow label="Created">
            <Tooltip content={formatAbsoluteDate(detail.createdAt)}>
              <span className="text-body-sm">{relativeDate(detail.createdAt)}</span>
            </Tooltip>
          </MetadataDetailRow>
          <MetadataDetailRow label="Updated">
            <Tooltip content={formatAbsoluteDate(detail.updatedAt)}>
              <span className="text-body-sm">{relativeDate(detail.updatedAt)}</span>
            </Tooltip>
          </MetadataDetailRow>
          <MetadataDetailRow label="Labels">
            <LabelPicker
              value={labels}
              onChange={handleLabelsChange}
              align="right"
            />
          </MetadataDetailRow>
        </div>
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

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default text-text-secondary";

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

export function SessionTicketView({
  ticket,
  detail,
  onMutate,
  subtasksPaneMode,
  localEdits,
  showConflictWarning,
  overrideConfirmed,
  onOverrideChange,
  isPushing,
  pushError,
  onPushToJira,
  onDiscard,
  onLocalTitleEdit,
  onLocalDescEdit,
  onViewDiff,
}: SessionTicketViewProps) {
  const [hasLocalEdit, setHasLocalEdit] = useState(false);

  return (
    <div className="space-y-0">
      {/* Conflict warning banner */}
      {showConflictWarning && (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/[0.06] px-4 py-3"
          style={{ animation: "fadeInUp 0.15s ease" }}
        >
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--color-status-warning)]" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-text-primary">Jira version changed since your last sync</p>
            <p className="mt-0.5 text-body-sm text-text-tertiary">
              Your local edits may overwrite remote changes. Review the diff or accept the Jira version.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                className="rounded-lg border border-border-default bg-overlay-subtle px-3 py-1 text-body-sm font-medium text-text-secondary cursor-pointer hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                Accept Jira version
              </button>
              {onViewDiff && (
                <button
                  type="button"
                  onClick={onViewDiff}
                  className="rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-3 py-1 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                >
                  Review diff
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Title (editable) */}
      <EditableTitle
        ticketKey={ticket.key}
        initialTitle={ticket.title}
        serverLocalEdit={localEdits?.title}
        onLocalEdit={onLocalTitleEdit ?? setHasLocalEdit}
        onViewDiff={onViewDiff}
      />

      {/* Description */}
      <EditableDescription
        ticketKey={ticket.key}
        initialDescription={detail.description}
        serverLocalEdit={localEdits?.description}
        attachments={detail.attachments}
        onLocalEdit={onLocalDescEdit ?? setHasLocalEdit}
        onDiscard={onDiscard}
        onPushToJira={onPushToJira}
        isPushing={isPushing}
        pushError={pushError}
        showConflictWarning={showConflictWarning}
        overrideConfirmed={overrideConfirmed}
        onOverrideChange={onOverrideChange}
      />

      {/* Attachments (only when present, to keep the session flow clean) */}
      {detail.attachments.length > 0 && (
        <AttachmentsSection attachments={detail.attachments} />
      )}

      {/* Subtasks (hidden when in side pane mode) */}
      {!subtasksPaneMode && (
        <SubtasksSection subtasks={detail.subtasks} ticketKey={ticket.key} onMutate={onMutate} />
      )}

      {/* Linked issues (full edit capabilities) */}
      <LinkedIssuesSection
        issues={detail.linkedIssues}
        ticketKey={ticket.key}
        onMutate={onMutate}
      />

      {/* Confluence pages */}
      <ConfluencePagesSection ticketKey={ticket.key} hideWhenEmpty />

      {/* Comments */}
      <CollapsibleComments ticketKey={ticket.key} jiraComments={detail.jiraComments} onMutate={onMutate} />
    </div>
  );
}
