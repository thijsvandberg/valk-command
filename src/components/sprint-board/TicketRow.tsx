"use client";

import { forwardRef, memo, useRef, useCallback, useState, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint } from "@/types/ticket";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { Checkbox } from "@/components/shared/Checkbox";
import type { ColumnId, ColumnPreset } from "@/components/sprint-board/FilterBar";
import { COLUMNS, COLUMN_PRESETS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Star, Rocket, GitBranch, Pencil, Check, X, Boxes } from "lucide-react";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { RefinementGemTrigger, type RefinementCardTicketInfo } from "@/components/sprint-board/RefinementGemHoverCard";
import type { PipelineHealthEntry, LastDeployedInfo } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge, POStatusCell } from "@/components/sprint-board/TicketTableCells";
import { Tooltip } from "@/components/shared/Tooltip";
import { OpenSubtasksIndicator } from "@/components/sprint-board/OpenSubtasksIndicator";
import { getBvColor } from "@/types/ticket";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { prefetchTicketPage } from "@/lib/prefetch";

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);


export interface TicketRowBaseProps {
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
  // Column visibility: either pass `col` + `columnOrder`, or use `preset` for a predefined set
  preset?: ColumnPreset;
  col?: (id: ColumnId) => boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses?: Record<string, POStatus>;
  readinessMap?: Record<string, TicketReadiness | null>;
  // Pipeline/follow data hoisted from per-row hooks to table level
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
  refinementSessions?: TicketSessionEntry[];
  /** Sibling ticket detail for the gem hover card pills, from already-loaded board data. */
  ticketInfoMap?: Map<string, RefinementCardTicketInfo>;
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  onViewRefinement?: (sessionId: string) => void;
  columnOrder?: ColumnId[];
  insertLine?: "above" | "below";
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  "data-index"?: number;
}

export const TicketRow = memo(forwardRef<HTMLTableRowElement, TicketRowBaseProps>(function TicketRow(
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
    preset,
    col: colProp,
    sprintNameMap = {},
    poStatuses = {},
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
    onPoStatusChange,
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
    refinementSessions,
    ticketInfoMap,
    onRemoveFromRefinement,
    onViewRefinement,
    columnOrder,
    insertLine,
    rowStyle,
    dragListeners,
    dragAttributes,
    "data-index": dataIndex,
  },
  ref
) {
  const presetCols = preset ? new Set(COLUMN_PRESETS[preset]) : null;
  const col = colProp ?? ((id: ColumnId) => presetCols?.has(id) ?? true);
  const isEditingTitle = editingTitleKey === ticket.key;
  const [editTitleValue, setEditTitleValue] = useState("");
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleEditContainerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(titleEditContainerRef, () => onEditingTitleKeyChange?.(null), { enabled: isEditingTitle, escapeClose: false });

  // Auto-size textarea: single row when text fits, expands for long text
  const autoSizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const health = healthMap?.[ticket.key];

  // Checkbox always visible when checked or when any row is checked (bulk mode)
  const showCheckbox = isChecked || someChecked;

  const checkbox = (
    <Checkbox
      checked={isChecked}
      className={showCheckbox ? "opacity-100" : `opacity-0 ${!isDragActive ? "group-hover/row:opacity-100" : ""}`}
    />
  );

  const isRemoved = Boolean(ticket.removedFromJiraAt);
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? { bg: "var(--color-status-neutral-subtle)", text: "var(--color-status-neutral)" };

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTicketPage(ticket.key);
    }, 200);
  }, [ticket.key]);

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const insertLineShadow = insertLine === "above"
    ? "inset 0 2px 0 var(--color-brand-500)"
    : insertLine === "below"
    ? "inset 0 -2px 0 var(--color-brand-500)"
    : undefined;
  // The leading accent bar is the row's colored left border (see className) so it sits flush at the
  // very edge with no gap. Only the drag insert-line stays a box-shadow.
  const style: React.CSSProperties = {
    ...(insertLineShadow ? { boxShadow: insertLineShadow } : {}),
    ...rowStyle,
  };

  const effectiveOrder = columnOrder ?? (preset ? COLUMN_PRESETS[preset] : DEFAULT_ORDER);

  const renderCell = (id: ColumnId) => {
    if (!col(id)) return null;
    switch (id) {
      case "type":
        return (
          <td key={id} className="overflow-hidden py-2 pr-2">
            <IssueTypeIcon type={ticket.type} />
          </td>
        );
      case "key":
        return (
          <td key={id} className="relative py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="flex items-center gap-1.5">
              <span
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <TicketStatusPill
                  ticketKey={ticket.key}
                  jiraStatus={ticket.jiraStatus}
                  title={ticket.title}
                  issueType={ticket.type}
                  readiness={isRemoved ? null : (readinessMap[ticket.key] ?? null)}
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
                  }}
                />
              </span>
              {!isRemoved && ticket.editState === "draft" && <EditStateDot state="draft" />}
              {!isRemoved && ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
              {!isRemoved && ticket.editState === "conflict" && <EditStateDot state="conflict" />}
              {!preset && (
                <Tooltip
                  content={isFollowed
                    ? "Following. Click to unfollow."
                    : "Follow for PR, pipeline, and deployment notifications."
                  }
                  delay={600}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      isFollowed ? unfollow?.(ticket.key) : follow?.(ticket.key);
                    }}
                    className={`shrink-0 cursor-pointer transition-opacity duration-150 ${
                      isFollowed ? "opacity-100" : "opacity-0 group-hover/row:opacity-40 hover:!opacity-100"
                    }`}
                  >
                    <Star
                      size={11}
                      strokeWidth={1.5}
                      className={isFollowed ? "text-amber-400 fill-amber-400" : "text-text-tertiary"}
                    />
                  </button>
                </Tooltip>
              )}
              {refinementSessions && refinementSessions.length > 0 && (
                <RefinementGemTrigger
                  sessions={refinementSessions}
                  currentKey={ticket.key}
                  ticketInfoMap={ticketInfoMap}
                  onRemoveFromRefinement={onRemoveFromRefinement}
                  onViewRefinement={onViewRefinement}
                >
                  <Boxes
                    size={10}
                    strokeWidth={1.5}
                    className="opacity-60"
                    style={{ color: "var(--meta-refine-fg)" }}
                  />
                </RefinementGemTrigger>
              )}
            </span>
          </td>
        );
      case "title":
        if (isEditingTitle) {
          return (
            <td
              key={id}
              className="relative max-w-0 py-2 pr-3 text-text-primary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Invisible placeholder keeps original row height */}
              <span className="invisible truncate block">{ticket.title}</span>
              {/* Floating editor overlays the table */}
              <div ref={titleEditContainerRef} className="absolute top-0 z-20 flex items-start gap-1" style={{ left: -7, right: -12, paddingTop: 3 }}>
                <textarea
                  ref={titleInputRef}
                  value={editTitleValue}
                  onChange={(e) => {
                    setEditTitleValue(e.target.value);
                    autoSizeTextarea(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const trimmed = editTitleValue.trim();
                      if (trimmed && trimmed !== ticket.title) {
                        onTitleChange?.(ticket.key, trimmed);
                      }
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
                    if (trimmed && trimmed !== ticket.title) {
                      onTitleChange?.(ticket.key, trimmed);
                    }
                    onEditingTitleKeyChange?.(null);
                  }}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:border-border-strong hover:text-text-secondary"
                  title="Save"
                >
                  <Check size={14} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onEditingTitleKeyChange?.(null)}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-[var(--color-surface-elevated)] text-text-tertiary shadow-[var(--shadow-lg)] transition-colors duration-100 hover:border-border-strong hover:text-text-secondary"
                  title="Cancel"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </td>
          );
        }

        return (
          <td
            key={id}
            className="overflow-hidden max-w-0 py-2 pr-3 text-text-primary"
          >
            <div className="flex items-center gap-1.5">
              <OpenSubtasksIndicator
                ticketKey={ticket.key}
                jiraStatus={ticket.jiraStatus}
                openCount={ticket.openSubtaskCount ?? 0}
                totalCount={ticket.totalSubtaskCount ?? 0}
                onCloseSubtasks={onCloseSubtasks}
              />
              <span className="min-w-0 truncate">{ticket.title}</span>
              {onTitleChange && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTitleValue(ticket.title);
                    onEditingTitleKeyChange?.(ticket.key);
                    requestAnimationFrame(() => {
                      const ta = titleInputRef.current;
                      if (ta) {
                        ta.focus();
                        ta.setSelectionRange(ta.value.length, ta.value.length);
                        autoSizeTextarea(ta);
                      }
                    });
                  }}
                  className="ml-1.5 hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted transition-colors duration-100 group-hover/row:flex hover:!bg-overlay-default hover:!text-text-secondary"
                  title="Edit summary"
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </td>
        );
      case "epic":
        return (
          <td key={id} className="py-2 pr-3 overflow-hidden">
            {ticket.epic && <EpicBadge epic={ticket.epic} className="max-w-full" />}
          </td>
        );
      case "jiraStatus":
        return (
          <td key={id} className="py-2 pr-3 overflow-hidden">
            {isRemoved ? (
              // DELETED: muted rose + strikethrough, outside the lifecycle (BRDG-322).
              <span
                className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-label font-medium line-through"
                style={{ backgroundColor: JIRA_STATUS_COLORS.DELETED.bg, color: JIRA_STATUS_COLORS.DELETED.text }}
              >
                DELETED
              </span>
            ) : (
              <span
                className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-label font-medium${ticket.jiraStatus === "DEPRECATED" ? " line-through" : ""}`}
                style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
              >
                {ticket.jiraStatus}
              </span>
            )}
          </td>
        );
      case "sprint":
        return (
          <td key={id} className="overflow-hidden py-2 pr-3 text-body-sm text-text-tertiary truncate">
            {ticket.sprintId
              ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId)
              : <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--color-text-muted)]/40 align-middle" />}
          </td>
        );
      case "points":
        return (
          <td
            key={id}
            className="py-2 pr-3 text-center"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <StoryPointPicker
              value={ticket.storyPoints}
              onChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : () => {}}
              subtle
              showMetricIcon
              richTooltip
              revealWhenEmpty
              revealGroup="row"
            />
          </td>
        );
      case "assignee":
        return (
          <td
            key={id}
            className="overflow-hidden py-2 pr-3"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {!isRemoved && onAssigneeChange ? (
              <AssigneePicker
                value={ticket.assignee ?? null}
                onChange={(u) => onAssigneeChange(ticket.key, u)}
                variant="avatar"
                avatarSize={18}
              />
            ) : (
              <Avatar assignee={ticket.assignee} size={18} />
            )}
          </td>
        );
      case "flagged":
        return (
          <td key={id} className="overflow-hidden py-2 pr-2">
            {ticket.flagged && <Flag className="h-3.5 w-3.5" style={{ color: "var(--color-status-error)" }} fill="currentColor" strokeWidth={0} />}
          </td>
        );
      case "poStatus":
        return (
          <td
            key={id}
            className="overflow-hidden py-2 pr-2 text-center"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <ReadinessCell
              value={readinessMap[ticket.key] ?? null}
              onChange={onReadinessChange ? (v) => onReadinessChange(ticket.key, v) : () => {}}
              subtle
            />
          </td>
        );
      case "quality":
        return (
          <td
            key={id}
            className="overflow-hidden py-2 pr-3 text-body-sm tabular-nums leading-none"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <QualityBadge
              score={ticket.qualityScore}
              ticketKey={ticket.key}
              isPopoverOpen={reviewPopoverKey === ticket.key}
              onTogglePopover={onToggleReviewPopover ? () => onToggleReviewPopover(ticket.key) : undefined}
            />
          </td>
        );
      case "bv":
        return (
          <td
            key={id}
            className="py-2 pr-3 text-center"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <BusinessValuePicker
              value={ticket.businessValue}
              onChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : () => {}}
              subtle
              showMetricIcon
              richTooltip
              revealWhenEmpty
              revealGroup="row"
            />
          </td>
        );
      case "notes":
        return (
          <td key={id} className="overflow-hidden py-2 pr-2">
            {ticket.notes && (
              <span title={ticket.notes}>
                <MessageSquare className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
              </span>
            )}
          </td>
        );
      case "pipeline":
        return (
          <td key={id} className="overflow-hidden py-1 px-2">
            <div className="flex flex-wrap items-center gap-1">
              {health && health.status !== "gray" && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-label font-medium leading-none tabular-nums ${
                    health.status === "green"
                      ? "bg-emerald-500/10 text-emerald-400/60"
                      : health.status === "red"
                      ? "bg-red-500/10 text-red-400/60"
                      : "bg-amber-500/10 text-amber-400/60"
                  }`}
                  title={`Pipeline: ${health.recentFails} failure${health.recentFails !== 1 ? "s" : ""} in last ${health.recentTotal} runs`}
                >
                  <GitBranch size={9} strokeWidth={1.5} className="shrink-0" />
                  {health.recentFails > 0 && <span>{health.recentFails}</span>}
                </span>
              )}
              {lastDeploy && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-label font-medium leading-none ${
                    lastDeploy.state === "SUCCESSFUL"
                      ? "bg-emerald-500/10 text-emerald-400/60"
                      : lastDeploy.state === "FAILED"
                      ? "bg-red-500/10 text-red-400/60"
                      : "bg-overlay-subtle text-text-muted"
                  }`}
                  title={`Deploy: ${lastDeploy.environment ?? "unknown"} — ${lastDeploy.state}${lastDeploy.completedAt ? ` (${new Date(lastDeploy.completedAt).toLocaleString("en-GB")})` : ""}`}
                >
                  <Rocket size={9} strokeWidth={1.5} className="shrink-0" />
                  <span className="uppercase tracking-wide">{lastDeploy.environment?.slice(0, 3)}</span>
                </span>
              )}
            </div>
          </td>
        );
      default:
        return null;
    }
  };

  // Drag listeners go on the row itself so any part of the row can initiate a drag.
  // Interactive children (checkbox, buttons, inputs) stop pointer propagation to prevent accidental drag starts.
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
        // Right-click opens the board-level quick-actions menu. Suppressed during
        // an active drag so the native menu never appears mid-reorder.
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
      className={`group/row border-b border-border-subtle border-l-[3px] transition-colors duration-100 ${
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
      {/* Leading cell: dedicated checkbox gutter on every row. Always reserves space so content never
          shifts; the checkbox itself stays hidden until row hover (or when a selection is active). */}
      <td
        className="cursor-pointer select-none py-2 pl-1 pr-1"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCheckboxClick(ticket.key, ticketIdx, e.shiftKey);
        }}
      >
        <div className="flex items-center justify-center">{checkbox}</div>
      </td>

      {effectiveOrder.map(renderCell)}

    </tr>
  );
}));

export const SortableTicketRow = memo(function SortableTicketRow(props: Omit<TicketRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index"> & {
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

  const { sortableData: _, ...rowProps } = props;

  return (
    <TicketRow
      {...rowProps}
      ref={setNodeRef}
      rowStyle={rowStyle}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
});
