"use client";

import { forwardRef, memo, useRef, useCallback, useState, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint } from "@/types/ticket";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { useEpicColor } from "@/hooks/useEpicColor";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Pencil, Check, X, Gem, IterationCw } from "lucide-react";
import { OpenSubtasksIndicator } from "@/components/sprint-board/OpenSubtasksIndicator";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { RefinementGemTrigger, type RefinementCardTicketInfo } from "@/components/sprint-board/RefinementGemHoverCard";
import type { PipelineHealthEntry, LastDeployedInfo } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge } from "@/components/sprint-board/TicketTableCells";
import { Tooltip } from "@/components/shared/Tooltip";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { prefetchTicketPage } from "@/lib/prefetch";

const ALL_TAGS: Set<InlineTagId> = new Set(["flag", "refinement", "quality", "notes", "poReadiness", "editState"]);

export interface BoardRowBaseProps {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  isInflight?: boolean;
  /** Highlighted because the open row context menu targets this row. */
  isContextTarget?: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  /** Which secondary signals are shown inline. Omitted = all (BRDG-239). */
  tags?: Set<InlineTagId>;
  /** Suppress the epic chip (e.g. when the board is grouped by epic). */
  hideEpic?: boolean;
  /** Show the sprint name inline (when multiple sprints are visible: All view / saved view). */
  showSprint?: boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses?: Record<string, POStatus>;
  readinessMap?: Record<string, TicketReadiness | null>;
  followedKeys?: string[];
  followTicket?: (key: string) => void;
  unfollowTicket?: (key: string) => void;
  lastDeployedMap?: Record<string, LastDeployedInfo>;
  healthMap?: Record<string, PipelineHealthEntry>;
  selectedTicket: string | null;
  onSelectTicket: (key: string | null) => void;
  onCheckboxClick: (key: string, idx: number, shiftKey: boolean) => void;
  onRowContextMenu?: (key: string, e: React.MouseEvent) => void;
  onPoStatusChange?: (key: string, status: POStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onIssueTypeChange?: (key: string, type: IssueType) => void;
  onTitleChange?: (key: string, title: string) => void;
  onAssigneeChange?: (key: string, user: AssignableUser | null) => void;
  onEpicChange?: (key: string, epic: EpicOption | null) => void;
  onSprintChange?: (key: string, sprintId: string | null) => void;
  sprints?: Sprint[];
  onCloseSubtasks?: (key: string) => Promise<void>;
  editingTitleKey?: string | null;
  onEditingTitleKeyChange?: (key: string | null) => void;
  reviewPopoverKey?: string | null;
  onToggleReviewPopover?: (key: string) => void;
  /** Request a quality review for this ticket (offered in the hover card when unscored). */
  onRunReview?: (key: string) => void | Promise<void>;
  refinementSessions?: TicketSessionEntry[];
  /** Sibling ticket detail for the gem hover card pills, from already-loaded board data. */
  ticketInfoMap?: Map<string, RefinementCardTicketInfo>;
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  onViewRefinement?: (sessionId: string) => void;
  insertLine?: "above" | "below";
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  "data-index"?: number;
}

export const BoardRow = memo(forwardRef<HTMLTableRowElement, BoardRowBaseProps>(function BoardRow(
  {
    ticket,
    ticketIdx,
    isChecked,
    isSelected,
    isFocused = false,
    isInflight = false,
    isContextTarget = false,
    someChecked,
    isDragActive,
    tags = ALL_TAGS,
    hideEpic = false,
    showSprint = false,
    sprintNameMap = {},
    readinessMap = {},
    followedKeys,
    followTicket: follow,
    unfollowTicket: unfollow,
    lastDeployedMap,
    healthMap,
    selectedTicket,
    onSelectTicket,
    onCheckboxClick,
    onRowContextMenu,
    onReadinessChange,
    onBusinessValueChange,
    onStoryPointsChange,
    onJiraStatusChange,
    onIssueTypeChange,
    onTitleChange,
    onAssigneeChange,
    onEpicChange,
    onSprintChange,
    sprints,
    onCloseSubtasks,
    editingTitleKey = null,
    onEditingTitleKeyChange,
    reviewPopoverKey = null,
    onToggleReviewPopover,
    onRunReview,
    refinementSessions,
    ticketInfoMap,
    onRemoveFromRefinement,
    onViewRefinement,
    insertLine,
    rowStyle,
    dragListeners,
    dragAttributes,
    "data-index": dataIndex,
  },
  ref
) {
  const isEditingTitle = editingTitleKey === ticket.key;
  const [editTitleValue, setEditTitleValue] = useState("");
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleEditContainerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(titleEditContainerRef, () => onEditingTitleKeyChange?.(null), { enabled: isEditingTitle, escapeClose: false });

  const autoSizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const health = healthMap?.[ticket.key];
  const isRemoved = Boolean(ticket.removedFromJiraAt);
  // Hook must run unconditionally; the empty-string fallback is ignored when there is no epic.
  const resolvedEpicColor = useEpicColor(ticket.epic ?? "");
  const epicColor = ticket.epic ? resolvedEpicColor : null;

  // Checkbox always visible when checked or when any row is checked (bulk mode)
  const showCheckbox = isChecked || someChecked;

  const checkbox = (
    <span
      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-[opacity,background-color] duration-150 ease-in-out ${
        isChecked
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
          : "border-border-strong bg-overlay-subtle"
      } ${showCheckbox ? "opacity-100" : `opacity-0 ${!isDragActive ? "group-hover/row:opacity-100" : ""}`}`}
    >
      {isChecked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMouseEnter = useCallback(() => {
    prefetchTimerRef.current = setTimeout(() => prefetchTicketPage(ticket.key), 200);
  }, [ticket.key]);
  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) { clearTimeout(prefetchTimerRef.current); prefetchTimerRef.current = null; }
  }, []);

  const insertLineShadow = insertLine === "above"
    ? "inset 0 2px 0 var(--color-brand-500)"
    : insertLine === "below"
    ? "inset 0 -2px 0 var(--color-brand-500)"
    : undefined;
  const style: React.CSSProperties = {
    ...(insertLineShadow ? { boxShadow: insertLineShadow } : {}),
    ...rowStyle,
  };

  const showReadiness = tags.has("poReadiness");

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
      style={{
        ...style,
        ...(isEditingTitle ? { position: "relative" as const, zIndex: 5 } : {}),
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => {
        if (!onRowContextMenu || isDragActive) return;
        e.preventDefault();
        onRowContextMenu(ticket.key, e);
      }}
      onClick={(e) => {
        if (isDragActive) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(`/tickets/${ticket.key}`, "_blank", "noopener,noreferrer");
          return;
        }
        onSelectTicket(ticket.key === selectedTicket ? null : ticket.key);
      }}
      className={`group/row border-l-[3px] transition-colors duration-100 ${
        dragListeners ? "cursor-grab active:cursor-grabbing select-none" : "cursor-pointer"
      } ${
        isSelected || isContextTarget
          ? "bg-[var(--color-brand-600)]/12 border-l-[var(--color-brand-300)]"
          : isChecked
          ? "bg-[var(--color-brand-500)]/6 border-l-[var(--color-brand-300)] hover:bg-[var(--color-brand-500)]/10"
          : ticket.flagged
          ? "bg-[color-mix(in_srgb,var(--color-status-error)_6%,transparent)] border-l-[var(--color-status-error)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_8%,transparent)]"
          : "border-l-transparent hover:bg-overlay-subtle hover:border-l-[var(--color-brand-400)]/25"
      } ${isFocused && !isSelected && !isContextTarget ? "outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40" : ""} ${isRemoved ? "opacity-50" : isInflight ? "opacity-70" : ""}`}
      {...dragListeners}
      {...dragAttributes}
    >
      <td className="p-0">
        {/* Horizontal gutters: pl-4 + the issue-icon's internal padding reads as ~24px on the
            left, so the right uses pr-[23px] to make the assignee sit the same distance from
            the edge as the issue icon does on the left. Rows are line-less and use py-3 for an
            airier rhythm (BRDG-239, "B+C"). */}
        <div className="flex items-center gap-2 py-3 pl-4 pr-[23px]">
          {/* Bulk mode: dedicated checkbox gutter on every row. */}
          {someChecked && (
            <div
              className="flex w-5 shrink-0 cursor-pointer items-center justify-center"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onCheckboxClick(ticket.key, ticketIdx, e.shiftKey); }}
            >
              {checkbox}
            </div>
          )}

          {/* Pill block: the hover checkbox sits over the issue-type icon (which fades on row hover),
              so no extra gutter is reserved and content never shifts. */}
          <div className="relative flex shrink-0 items-center gap-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
            {!someChecked && (
              <span
                className="absolute left-1 top-1/2 z-10 flex -translate-y-1/2 cursor-pointer items-center"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCheckboxClick(ticket.key, ticketIdx, e.shiftKey); }}
              >
                {checkbox}
              </span>
            )}
            <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <TicketStatusPill
                dimTypeOnRowHover={!someChecked}
                ticketKey={ticket.key}
                jiraStatus={ticket.jiraStatus}
                title={ticket.title}
                issueType={ticket.type}
                readiness={isRemoved ? null : (readinessMap[ticket.key] ?? null)}
                showReadiness={showReadiness}
                onReadinessChange={isRemoved ? undefined : (onReadinessChange ? (r) => onReadinessChange(ticket.key, r) : undefined)}
                onJiraStatusChange={isRemoved ? undefined : (onJiraStatusChange ? (s) => onJiraStatusChange(ticket.key, s) : undefined)}
                onIssueTypeChange={isRemoved ? undefined : (onIssueTypeChange ? (t) => onIssueTypeChange(ticket.key, t) : undefined)}
                variant="list"
                size="lg"
                removedFromJira={isRemoved}
                onStoryPointsChange={isRemoved ? undefined : (onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : undefined)}
                onBusinessValueChange={isRemoved ? undefined : (onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : undefined)}
                onAssigneeChange={isRemoved ? undefined : (onAssigneeChange ? (u) => onAssigneeChange(ticket.key, u) : undefined)}
                onEpicChange={isRemoved ? undefined : (onEpicChange ? (e) => onEpicChange(ticket.key, e) : undefined)}
                onSprintChange={isRemoved ? undefined : (onSprintChange ? (s) => onSprintChange(ticket.key, s) : undefined)}
                onToggleFollow={isRemoved ? undefined : (() => (isFollowed ? unfollow?.(ticket.key) : follow?.(ticket.key)))}
                onRunReview={isRemoved || !onRunReview ? undefined : () => onRunReview(ticket.key)}
                sprints={sprints}
                hoverData={{
                  title: ticket.title,
                  storyPoints: ticket.storyPoints,
                  businessValue: ticket.businessValue,
                  sprintId: ticket.sprintId ?? null,
                  sprintName: ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId) : null,
                  epicKey: ticket.epicKey,
                  epic: ticket.epic,
                  assignee: ticket.assignee ?? null,
                  reporter: ticket.reporter ?? null,
                  openSubtaskCount: ticket.openSubtaskCount ?? 0,
                  totalSubtaskCount: ticket.totalSubtaskCount ?? 0,
                  flagged: ticket.flagged,
                  pipelineHealth: health,
                  lastDeploy,
                  readiness: isRemoved ? null : (readinessMap[ticket.key] ?? null),
                  qualityScore: ticket.qualityScore,
                  notes: ticket.notes,
                  followed: isFollowed,
                  editState: isRemoved || !ticket.editState || ticket.editState === "clean" ? null : ticket.editState,
                  refinementNames: refinementSessions?.map((s) => s.name),
                }}
              />
            </span>
            {tags.has("editState") && !isRemoved && ticket.editState === "draft" && <EditStateDot state="draft" />}
            {tags.has("editState") && !isRemoved && ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
            {tags.has("editState") && !isRemoved && ticket.editState === "conflict" && <EditStateDot state="conflict" />}
          </div>

          {isEditingTitle ? (
            <div ref={titleEditContainerRef} className="z-20 flex min-w-0 flex-1 items-start gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <textarea
                ref={titleInputRef}
                value={editTitleValue}
                onChange={(e) => { setEditTitleValue(e.target.value); autoSizeTextarea(e.target); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const trimmed = editTitleValue.trim();
                    if (trimmed && trimmed !== ticket.title) onTitleChange?.(ticket.key, trimmed);
                    onEditingTitleKeyChange?.(null);
                  } else if (e.key === "Escape") {
                    onEditingTitleKeyChange?.(null);
                  }
                }}
                rows={1}
                className="min-w-0 flex-1 resize-none overflow-hidden rounded border border-[var(--color-brand-500)]/40 bg-[var(--color-surface-elevated)] px-1.5 py-1 text-body-lg leading-snug text-text-primary shadow-[var(--shadow-lg)] outline-none focus:border-[var(--color-brand-500)]/70"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = editTitleValue.trim();
                  if (trimmed && trimmed !== ticket.title) onTitleChange?.(ticket.key, trimmed);
                  onEditingTitleKeyChange?.(null);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:text-text-secondary"
                title="Save"
              >
                <Check size={14} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => onEditingTitleKeyChange?.(null)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:text-text-secondary"
                title="Cancel"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <>
              {/* Title — the only element that yields space (BRDG-239). */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-text-primary">
                {/* Warning: open subtasks on an otherwise-done ticket. Self-hides in every other case. */}
                <OpenSubtasksIndicator
                  ticketKey={ticket.key}
                  jiraStatus={ticket.jiraStatus}
                  openCount={ticket.openSubtaskCount ?? 0}
                  totalCount={ticket.totalSubtaskCount ?? 0}
                  onCloseSubtasks={onCloseSubtasks}
                />
                <span className="min-w-0 truncate text-body-lg">{ticket.title}</span>
                {onTitleChange && !isRemoved && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTitleValue(ticket.title);
                      onEditingTitleKeyChange?.(ticket.key);
                      requestAnimationFrame(() => {
                        const ta = titleInputRef.current;
                        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); autoSizeTextarea(ta); }
                      });
                    }}
                    className="ml-0.5 hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted transition-colors duration-100 group-hover/row:flex hover:!bg-overlay-default hover:!text-text-secondary"
                    title="Edit summary"
                  >
                    <Pencil size={11} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* Notes + refinement signals, placed just left of the epic chip. */}
              {tags.has("notes") && ticket.notes && (
                <span className="shrink-0" title={ticket.notes}>
                  <MessageSquare className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                </span>
              )}
              {tags.has("refinement") && refinementSessions && refinementSessions.length > 0 && (
                <RefinementGemTrigger
                  sessions={refinementSessions}
                  currentKey={ticket.key}
                  ticketInfoMap={ticketInfoMap}
                  onRemoveFromRefinement={onRemoveFromRefinement}
                  onViewRefinement={onViewRefinement}
                >
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-500)]/12 px-2 text-[var(--color-brand-300)] ring-1 ring-inset ring-[var(--color-brand-500)]/15">
                    <Gem size={12} strokeWidth={1.75} className="shrink-0" />
                    {refinementSessions.length > 1 && (
                      <span className="text-[11px] font-medium leading-none tabular-nums">{refinementSessions.length}</span>
                    )}
                  </span>
                </RefinementGemTrigger>
              )}

              {/* Epic chip — shrinks with the title when space is tight. */}
              {!hideEpic && epicColor && (
                <span
                  className="inline-flex min-w-0 shrink items-center truncate whitespace-nowrap rounded-[3px] border-l-2 py-0.5 pl-1.5 pr-2 text-[10.5px] font-medium tracking-wide"
                  style={{ backgroundColor: epicColor.bg, color: epicColor.text, borderLeftColor: epicColor.text }}
                >
                  {ticket.epic}
                </span>
              )}

              {/* Sprint name — only when several sprints are visible at once (All view / saved view). */}
              {showSprint && ticket.sprintId && (
                <span
                  className="inline-flex min-w-0 shrink items-center gap-1 truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] text-text-tertiary"
                  style={{ backgroundColor: "var(--color-overlay-subtle)" }}
                  title={sprintNameMap[ticket.sprintId] ?? ticket.sprintId}
                >
                  <IterationCw size={9} strokeWidth={1.75} className="shrink-0 opacity-70" />
                  {sprintNameMap[ticket.sprintId] ?? ticket.sprintId}
                </span>
              )}

              {/* Conditional inline tags (do not yield space). */}
              {tags.has("flag") && ticket.flagged && (
                <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-status-error)" }} fill="currentColor" strokeWidth={0} />
              )}
              {/* Quality Score: only shown once a review exists. Unscored tickets show nothing
                  here; a review can be requested from the hover card instead (BRDG-239). */}
              {tags.has("quality") && ticket.qualityScore != null && (
                <span
                  className="shrink-0 leading-none"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <QualityBadge
                    score={ticket.qualityScore}
                    ticketKey={ticket.key}
                    isPopoverOpen={reviewPopoverKey === ticket.key}
                    onTogglePopover={onToggleReviewPopover ? () => onToggleReviewPopover(ticket.key) : undefined}
                  />
                </span>
              )}
              {/* SP / BV — compact, right of the tags. */}
              <div
                className="flex shrink-0 items-center gap-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <StoryPointPicker
                  value={ticket.storyPoints}
                  onChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : () => {}}
                  subtle
                  showMetricIcon
                  richTooltip
                />
                <BusinessValuePicker
                  value={ticket.businessValue}
                  onChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : () => {}}
                  subtle
                  showMetricIcon
                  richTooltip
                />
              </div>

              {/* Assignee — right-aligned. */}
              <div className="shrink-0">
                <Avatar assignee={ticket.assignee} size={18} />
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}));

export const SortableBoardRow = memo(function SortableBoardRow(props: Omit<BoardRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index"> & {
  sortableData?: Record<string, unknown>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.ticket.key,
    data: props.sortableData ?? { sprintId: props.ticket.sprintId },
  });

  const rowStyle = useMemo<React.CSSProperties>(() => ({
    transform: isDragging ? undefined : CSS.Transform.toString(transform) || undefined,
    transition: isDragging ? undefined : transition ?? undefined,
    ...(isDragging ? {
      opacity: 0.3,
      outline: "1px dashed var(--color-overlay-strong)",
      outlineOffset: "-1px",
    } : {}),
  }), [isDragging, transform, transition]);

  const { sortableData: _sortableData, ...rowProps } = props;

  return (
    <BoardRow
      {...rowProps}
      ref={setNodeRef}
      rowStyle={rowStyle}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
});
