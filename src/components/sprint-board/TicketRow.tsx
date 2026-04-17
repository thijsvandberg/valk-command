"use client";

import { forwardRef, useRef, useCallback } from "react";
import type { Ticket, POStatus, TicketReadiness } from "@/types/ticket";
import { getEpicColor, JIRA_STATUS_COLORS } from "@/types/ticket";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { COLUMNS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Flag, MessageSquare, Star, Rocket, GitBranch } from "lucide-react";
import { useFollowedTickets, useFollowTicket, useLastDeployed, usePipelineHealth } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge, POStatusCell } from "@/components/sprint-board/TicketTableCells";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { prefetchTicketDetail } from "@/lib/prefetch";

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);


export interface TicketRowBaseProps {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isInflight: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  col: (id: ColumnId) => boolean;
  sprintNameMap: Record<string, string>;
  poStatuses: Record<string, POStatus>;
  readinessMap: Record<string, TicketReadiness | null>;
  selectedTicket: string | null;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onSelectTicket: (key: string | null) => void;
  onCheckboxClick: (key: string, idx: number, shiftKey: boolean) => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
  onReadinessChange: (key: string, readiness: TicketReadiness | null) => void;
  reviewPopoverKey: string | null;
  onToggleReviewPopover: (key: string) => void;
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
    isHovered,
    isSelected,
    isFocused,
    isInflight,
    someChecked,
    isDragActive,
    col,
    sprintNameMap,
    poStatuses,
    readinessMap,
    selectedTicket,
    onHoverRow,
    onLeaveRow,
    onSelectTicket,
    onCheckboxClick,
    onPoStatusChange,
    onReadinessChange,
    reviewPopoverKey,
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
  const { data: followedKeys } = useFollowedTickets();
  const { follow, unfollow } = useFollowTicket();
  const isFollowed = followedKeys?.includes(ticket.key) ?? false;
  const { data: lastDeployedMap } = useLastDeployed();
  const lastDeploy = lastDeployedMap?.[ticket.key];
  const { data: healthMap } = usePipelineHealth();
  const health = healthMap?.[ticket.key];

  // Suppress hover-based UI (checkbox, drag handle) on non-active rows during any drag
  const showCheckbox = isChecked || (isHovered && !isDragActive) || someChecked;
  const isRemoved = Boolean(ticket.removedFromJiraAt);
  const epicColor = ticket.epic ? getEpicColor(ticket.epic) ?? null : null;
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? { bg: "rgba(148, 163, 184, 0.08)", text: "#64748b" };

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    onHoverRow(ticket.key);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTicketDetail(ticket.key);
    }, 200);
  }, [ticket.key, onHoverRow]);

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    onLeaveRow();
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

  const effectiveOrder = columnOrder ?? DEFAULT_ORDER;

  const renderCell = (id: ColumnId) => {
    if (!col(id)) return null;
    switch (id) {
      case "type": {
        const sl = stickyOffsets?.[id];
        return (
          <td
            key={id}
            className={`overflow-hidden py-1.5 pr-2${sl !== undefined ? " bg-[var(--color-surface-elevated)] group-hover/row:bg-[var(--color-surface-elevated-hover)]" : ""}`}
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
            className={`overflow-hidden py-1.5 pr-3 font-mono text-xs text-white/50 leading-none${sl !== undefined ? " bg-[var(--color-surface-elevated)] group-hover/row:bg-[var(--color-surface-elevated-hover)]" : ""}`}
            style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
          >
            <span className="flex items-center gap-1.5">
              {ticket.key}
              {ticket.editState === "draft" && <EditStateDot state="draft" />}
              {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
              {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
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
            </span>
          </td>
        );
      }
      case "title": {
        const sl = stickyOffsets?.[id];
        return (
          <td
            key={id}
            className={`max-w-0 truncate py-1.5 pr-3 text-white/80${sl !== undefined ? " bg-[var(--color-surface-elevated)] group-hover/row:bg-[var(--color-surface-elevated-hover)]" : ""}`}
            style={sl !== undefined ? { position: "sticky", left: sl, zIndex: 2 } : undefined}
          >
            {ticket.title}
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
          <td key={id} className="overflow-hidden py-1.5 pr-3 text-center tabular-nums text-white/30">
            {ticket.storyPoints ?? "-"}
          </td>
        );
      case "assignee":
        return (
          <td key={id} className="overflow-hidden py-1.5 pr-3">
            <Avatar assignee={ticket.assignee} />
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
              onChange={(v) => onReadinessChange(ticket.key, v)}
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
              onTogglePopover={() => onToggleReviewPopover(ticket.key)}
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
      style={style}
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
      {/* Checkbox — stops pointer propagation so drag sensor never activates on checkbox interaction */}
      <td
        className={`cursor-pointer select-none py-1.5 pl-1 pr-1${stickyOffsets?._check !== undefined ? " bg-[var(--color-surface-elevated)] group-hover/row:bg-[var(--color-surface-elevated-hover)]" : ""}`}
        style={stickyOffsets?._check !== undefined ? { position: "sticky", left: stickyOffsets._check, zIndex: 2 } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCheckboxClick(ticket.key, ticketIdx, e.shiftKey);
        }}
      >
        <div
          className="flex items-center justify-center transition-opacity duration-100"
          style={{ opacity: showCheckbox ? 1 : 0 }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="pointer-events-none h-3 w-3 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)]"
          />
        </div>
      </td>

      {effectiveOrder.map(renderCell)}

    </tr>
  );
});

export function SortableTicketRow(props: Omit<TicketRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index">) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.ticket.key,
    // sprintId is used by SprintBoard's drag handler to detect cross-group drops in All view
    data: { sprintId: props.ticket.sprintId },
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

  return (
    <TicketRow
      {...props}
      ref={setNodeRef}
      rowStyle={rowStyle}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
}
