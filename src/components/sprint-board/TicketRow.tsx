"use client";

import { forwardRef, useRef, useCallback, useState, useEffect } from "react";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus } from "@/types/ticket";
import { getEpicColor, JIRA_STATUS_COLORS } from "@/types/ticket";
import type { ColumnId, ColumnPreset } from "@/components/sprint-board/FilterBar";
import { COLUMNS, COLUMN_PRESETS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Star, Rocket, GitBranch, Pencil, Check, X } from "lucide-react";
import { useFollowedTickets, useFollowTicket, useLastDeployed, usePipelineHealth } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge, POStatusCell } from "@/components/sprint-board/TicketTableCells";
import { getBvColor } from "@/types/ticket";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { prefetchTicketDetail } from "@/lib/prefetch";

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);


export interface TicketRowBaseProps {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isHovered?: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  isInflight?: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  // Column visibility: either pass `col` + `columnOrder`, or use `preset` for a predefined set
  preset?: ColumnPreset;
  col?: (id: ColumnId) => boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses?: Record<string, POStatus>;
  readinessMap?: Record<string, TicketReadiness | null>;
  selectedTicket: string | null;
  onHoverRow?: (key: string | null) => void;
  onLeaveRow?: () => void;
  onSelectTicket: (key: string | null) => void;
  onCheckboxClick: (key: string, idx: number, shiftKey: boolean) => void;
  onPoStatusChange?: (key: string, status: POStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onIssueTypeChange?: (key: string, type: IssueType) => void;
  onTitleChange?: (key: string, title: string) => void;
  editingTitleKey?: string | null;
  onEditingTitleKeyChange?: (key: string | null) => void;
  reviewPopoverKey?: string | null;
  onToggleReviewPopover?: (key: string) => void;
  columnOrder?: ColumnId[];
  insertLine?: "above" | "below";
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  stickyOffsets?: Record<string, number>;
  "data-index"?: number;
}

export const TicketRow = forwardRef<HTMLTableRowElement, TicketRowBaseProps>(function TicketRow(
  {
    ticket,
    ticketIdx,
    isChecked,
    isHovered = false,
    isSelected,
    isFocused = false,
    isInflight = false,
    someChecked,
    isDragActive,
    preset,
    col: colProp,
    sprintNameMap = {},
    poStatuses = {},
    readinessMap = {},
    selectedTicket,
    onHoverRow,
    onLeaveRow,
    onSelectTicket,
    onCheckboxClick,
    onPoStatusChange,
    onReadinessChange,
    onBusinessValueChange,
    onJiraStatusChange,
    onIssueTypeChange,
    onTitleChange,
    editingTitleKey = null,
    onEditingTitleKeyChange,
    reviewPopoverKey = null,
    onToggleReviewPopover,
    columnOrder,
    insertLine,
    rowStyle,
    dragListeners,
    dragAttributes,
    stickyOffsets,
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

  // Click outside closes the editor
  useEffect(() => {
    if (!isEditingTitle) return;
    function handleMouseDown(e: MouseEvent) {
      if (titleEditContainerRef.current && !titleEditContainerRef.current.contains(e.target as Node)) {
        onEditingTitleKeyChange?.(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isEditingTitle, onEditingTitleKeyChange]);

  // Auto-size textarea: single row when text fits, expands for long text
  const autoSizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const { data: followedKeys } = useFollowedTickets();
  const { follow, unfollow } = useFollowTicket();
  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const { data: lastDeployedMap } = useLastDeployed();
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const { data: healthMap } = usePipelineHealth();
  const health = healthMap?.[ticket.key];

  // Suppress hover-based UI (checkbox, drag handle) on non-active rows during any drag.
  const showCheckbox = isChecked || (isHovered && !isDragActive) || someChecked;
  const isRemoved = Boolean(ticket.removedFromJiraAt);
  const epicColor = ticket.epic ? getEpicColor(ticket.epic) ?? null : null;
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? { bg: "rgba(148, 163, 184, 0.08)", text: "#64748b" };

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    onHoverRow?.(ticket.key);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTicketDetail(ticket.key);
    }, 200);
  }, [ticket.key, onHoverRow]);

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    onLeaveRow?.();
  }, [onLeaveRow]);

  const insertLineShadow = insertLine === "above"
    ? "inset 0 2px 0 var(--color-brand-500)"
    : insertLine === "below"
    ? "inset 0 -2px 0 var(--color-brand-500)"
    : undefined;
  const style: React.CSSProperties = {
    ...(ticket.flagged ? { boxShadow: insertLineShadow ? `inset 4px 0 0 #e5534b, ${insertLineShadow}` : "inset 4px 0 0 #e5534b" } : insertLineShadow ? { boxShadow: insertLineShadow } : {}),
    ...rowStyle,
  };

  const effectiveOrder = columnOrder ?? (preset ? COLUMN_PRESETS[preset] : DEFAULT_ORDER);

  const renderCell = (id: ColumnId) => {
    if (!col(id)) return null;
    switch (id) {
      case "type": {
        const sl = stickyOffsets?.[id];
        return (
          <td
            key={id}
            className={`overflow-hidden py-1.5 pr-2${sl !== undefined ? " bg-[var(--color-surface-base)] group-hover/row:bg-[var(--color-surface-elevated)]" : ""}`}
            style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
          >
            <IssueTypeIcon type={ticket.type} />
          </td>
        );
      }
      case "key": {
        const sl = stickyOffsets?.[id];
        return (
          <td
            key={id}
            className={`py-2 pr-3${sl !== undefined ? " bg-[var(--color-surface-base)] group-hover/row:bg-[var(--color-surface-elevated)]" : ""}`}
            style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
          >
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
                  readiness={readinessMap[ticket.key] ?? null}
                  onReadinessChange={onReadinessChange ? (r) => onReadinessChange(ticket.key, r) : undefined}
                  onJiraStatusChange={onJiraStatusChange ? (s) => onJiraStatusChange(ticket.key, s) : undefined}
                  onIssueTypeChange={onIssueTypeChange ? (t) => onIssueTypeChange(ticket.key, t) : undefined}
                  variant="list"
                  size="lg"
                />
              </span>
              {ticket.editState === "draft" && <EditStateDot state="draft" />}
              {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
              {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
              {!preset && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    isFollowed ? unfollow(ticket.key) : follow(ticket.key);
                  }}
                  className={`shrink-0 cursor-pointer transition-opacity duration-150 ${
                    isFollowed ? "opacity-100" : "opacity-0 group-hover/row:opacity-40 hover:!opacity-100"
                  }`}
                  title={isFollowed ? "Unfollow" : "Follow for notifications"}
                >
                  <Star
                    size={11}
                    strokeWidth={1.5}
                    className={isFollowed ? "text-amber-400 fill-amber-400" : "text-white/40"}
                  />
                </button>
              )}
            </span>
          </td>
        );
      }
      case "title": {
        const sl = stickyOffsets?.[id];
        const stickyBg = sl !== undefined ? " bg-[var(--color-surface-base)] group-hover/row:bg-[var(--color-surface-elevated)]" : "";

        if (isEditingTitle) {
          return (
            <td
              key={id}
              className={`relative max-w-0 py-1.5 pr-3 text-white/80${stickyBg}`}
              style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
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
                  className="min-w-0 flex-1 resize-none overflow-hidden rounded border border-[var(--color-brand-500)]/40 bg-[var(--color-surface-elevated)] px-1.5 py-1 text-sm leading-snug text-white/90 shadow-[0_4px_24px_rgba(0,0,0,0.4)] outline-none focus:border-[var(--color-brand-500)]/70"
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
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-white/[0.08] bg-[var(--color-surface-elevated)] text-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-colors duration-100 hover:border-white/[0.15] hover:text-white/70"
                  title="Save"
                >
                  <Check size={14} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onEditingTitleKeyChange?.(null)}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-white/[0.08] bg-[var(--color-surface-elevated)] text-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-colors duration-100 hover:border-white/[0.15] hover:text-white/70"
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
            className={`overflow-hidden max-w-0 py-1.5 pr-3 text-white/80${stickyBg}`}
            style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
          >
            <div className="flex items-center">
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
                  className="ml-1.5 hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-white/25 transition-colors duration-100 group-hover/row:flex hover:!bg-white/[0.06] hover:!text-white/60"
                  title="Edit summary"
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </td>
        );
      }
      case "epic":
        return (
          <td key={id} className="py-1.5 pr-3 overflow-hidden">
            {epicColor && (
              <span
                className="inline-flex items-center max-w-full truncate whitespace-nowrap rounded px-1.5 py-0.5 text-label font-medium"
                style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
              >
                {ticket.epic}
              </span>
            )}
          </td>
        );
      case "jiraStatus":
        return (
          <td key={id} className="py-1.5 pr-3 overflow-hidden">
            {isRemoved ? (
              <span className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-label font-medium bg-red-500/10 text-red-400/70">
                REMOVED
              </span>
            ) : (
              <span
                className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-label font-medium"
                style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
              >
                {ticket.jiraStatus}
              </span>
            )}
          </td>
        );
      case "sprint":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-3 text-xs text-white/35 truncate">
            {ticket.sprintId
              ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId)
              : <span className="text-white/15">&#8212;</span>}
          </td>
        );
      case "points":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-3 text-center text-xs tabular-nums text-white/30">
            {ticket.storyPoints ?? "-"}
          </td>
        );
      case "assignee":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-3">
            <Avatar assignee={ticket.assignee} size={18} />
          </td>
        );
      case "flagged":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-2">
            {ticket.flagged && <Flag className="h-3.5 w-3.5 text-[#e5534b]" fill="currentColor" strokeWidth={0} />}
          </td>
        );
      case "poStatus":
        return (
          <td
            key={id}
            className="overflow-hidden py-1.5 pr-2 text-center"
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
            className="overflow-hidden py-1.5 pr-3 text-xs tabular-nums leading-none"
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
            className="overflow-hidden py-1.5 pr-3 text-center"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <BusinessValuePicker
              value={ticket.businessValue}
              onChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : () => {}}
              subtle
            />
          </td>
        );
      case "notes":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-2">
            {ticket.notes && (
              <span title={ticket.notes}>
                <MessageSquare className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
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
                      : "bg-white/[0.04] text-white/25"
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
      style={{ ...style, ...(isEditingTitle ? { position: "relative" as const, zIndex: 5 } : {}) }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        if (isDragActive) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(`/tickets/${ticket.key}`, "_blank", "noopener,noreferrer");
          return;
        }
        onSelectTicket(ticket.key === selectedTicket ? null : ticket.key);
      }}
      className={`group/row border-b border-white/[0.03] transition-colors duration-100 ${
        dragListeners ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${
        isSelected
          ? "bg-[var(--color-brand-600)]/12 border-l-2 border-l-[var(--color-brand-500)]"
          : isHovered
          ? ticket.flagged ? "bg-[rgba(229,83,75,0.08)]" : "bg-white/[0.02]"
          : ticket.flagged
          ? "bg-[rgba(229,83,75,0.06)]"
          : ""
      } ${isFocused && !isSelected ? "outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40" : ""} ${isRemoved ? "opacity-50" : isInflight ? "opacity-70" : ""}`}
      {...dragListeners}
      {...dragAttributes}
    >
      {/* Checkbox -- stops pointer propagation so drag sensor never activates on checkbox interaction */}
      <td
        className={`cursor-pointer select-none py-1.5 pl-1 pr-1${stickyOffsets?._check !== undefined ? " bg-[var(--color-surface-base)] group-hover/row:bg-[var(--color-surface-elevated)]" : ""}`}
        style={stickyOffsets?._check !== undefined ? { position: "sticky", left: stickyOffsets._check, zIndex: 2 } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCheckboxClick(ticket.key, ticketIdx, e.shiftKey);
        }}
      >
        <div className="flex items-center justify-center">
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
              isChecked
                ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                : "border-white/[0.12] bg-white/[0.03]"
            }`}
            style={{ opacity: showCheckbox ? 1 : 0, transition: "opacity 0.15s ease, background-color 0.15s ease" }}
          >
            {isChecked && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </td>

      {effectiveOrder.map(renderCell)}

    </tr>
  );
});

export function SortableTicketRow(props: Omit<TicketRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index"> & {
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

  const rowStyle: React.CSSProperties = {
    // When dragging, freeze the placeholder at its original position.
    // The DragOverlay handles pointer tracking; the placeholder must not jump.
    transform: isDragging ? undefined : CSS.Transform.toString(transform) || undefined,
    transition: isDragging ? undefined : transition ?? undefined,
    ...(isDragging ? {
      opacity: 0.3,
      outline: "1px dashed rgba(255,255,255,0.08)",
      outlineOffset: "-1px",
    } : {}),
  };

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
}
