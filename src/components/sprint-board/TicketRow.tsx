"use client";

import { forwardRef, useRef, useCallback } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import { getEpicColor, JIRA_STATUS_COLORS } from "@/types/ticket";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { COLUMNS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { GripVertical, Flag, MessageSquare, Star, Rocket, GitBranch } from "lucide-react";
import { useFollowedTickets, useFollowTicket, useLastDeployed, usePipelineHealth } from "@/hooks/usePipelines";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge, POStatusCell } from "@/components/sprint-board/TicketTableCells";
import { prefetchTicketDetail } from "@/lib/prefetch";

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);

function DragHandle({ listeners, attributes }: { listeners?: ReturnType<typeof useSortable>["listeners"]; attributes?: ReturnType<typeof useSortable>["attributes"] }) {
  if (!listeners) {
    return <td className="w-5 py-1.5 pl-1 pr-0" />;
  }
  return (
    <td
      className="w-5 py-1.5 pl-1 pr-0 opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-3.5 w-3.5 text-white/25 hover:text-white/50" strokeWidth={1.5} />
    </td>
  );
}

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
  selectedTicket: string | null;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onSelectTicket: (key: string | null) => void;
  onCheckboxClick: (key: string, idx: number, shiftKey: boolean) => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
  reviewPopoverKey: string | null;
  onToggleReviewPopover: (key: string) => void;
  columnOrder?: ColumnId[];
  rowStyle?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
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
    selectedTicket,
    onHoverRow,
    onLeaveRow,
    onSelectTicket,
    onCheckboxClick,
    onPoStatusChange,
    reviewPopoverKey,
    onToggleReviewPopover,
    columnOrder,
    rowStyle,
    dragListeners,
    dragAttributes,
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

  const showCheckbox = isChecked || isHovered || someChecked;
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

  const style: React.CSSProperties = {
    ...(ticket.flagged ? { boxShadow: "inset 4px 0 0 #e5534b" } : {}),
    ...rowStyle,
  };

  const effectiveOrder = columnOrder ?? DEFAULT_ORDER;

  const renderCell = (id: ColumnId) => {
    if (!col(id)) return null;
    switch (id) {
      case "type":
        return (
          <td key={id} className="py-1.5 pr-2">
            <IssueTypeIcon type={ticket.type} />
          </td>
        );
      case "key":
        return (
          <td key={id} className="py-1.5 pr-3 font-mono text-xs text-white/50 leading-none">
            <span className="flex items-center gap-1.5">
              {ticket.key}
              {ticket.editState === "draft" && <EditStateDot state="draft" />}
              {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
              {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
              <button
                type="button"
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
      case "title":
        return (
          <td key={id} className="max-w-0 truncate py-1.5 pr-3 text-white/80">
            {ticket.title}
          </td>
        );
      case "epic":
        return (
          <td key={id} className="py-1.5 pr-3 overflow-hidden">
            {epicColor && (
              <span
                className="inline-block max-w-full truncate whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium"
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
              <span className="inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400/70">
                REMOVED
              </span>
            ) : (
              <span
                className="inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
              >
                {ticket.jiraStatus}
              </span>
            )}
          </td>
        );
      case "sprint":
        return (
          <td key={id} className="py-1.5 pr-3 text-xs text-white/35 truncate">
            {ticket.sprintId
              ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId)
              : <span className="text-white/15">&#8212;</span>}
          </td>
        );
      case "points":
        return (
          <td key={id} className="py-1.5 pr-3 text-center tabular-nums text-white/30">
            {ticket.storyPoints ?? "-"}
          </td>
        );
      case "assignee":
        return (
          <td key={id} className="py-1.5 pr-3">
            <Avatar assignee={ticket.assignee} />
          </td>
        );
      case "flagged":
        return (
          <td key={id} className="py-1.5 pr-2">
            {ticket.flagged && <Flag className="h-3.5 w-3.5 text-[#e5534b]" fill="currentColor" strokeWidth={0} />}
          </td>
        );
      case "poStatus":
        return (
          <td
            key={id}
            className="py-1.5 pr-2 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <POStatusCell
              value={poStatuses[ticket.key] ?? null}
              onChange={(v) => onPoStatusChange(ticket.key, v)}
            />
          </td>
        );
      case "quality":
        return (
          <td
            key={id}
            className="py-1.5 pr-3 text-xs tabular-nums leading-none"
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
          <td key={id} className="py-1.5 pr-2">
            {ticket.notes && (
              <span title={ticket.notes}>
                <MessageSquare className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
              </span>
            )}
          </td>
        );
      case "pipeline":
        return (
          <td key={id} className="py-1.5 px-2">
            <div className="flex items-center gap-1.5">
              {health && health.status !== "gray" && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    health.status === "green"
                      ? "bg-emerald-500/10 text-emerald-400/70"
                      : health.status === "red"
                      ? "bg-red-500/10 text-red-400/70"
                      : "bg-amber-500/10 text-amber-400/70"
                  }`}
                  title={`Pipeline health: ${health.recentFails} failures in last ${health.recentTotal} runs`}
                >
                  <GitBranch size={9} strokeWidth={1.5} />
                  {health.recentFails > 0 && health.recentFails}
                </span>
              )}
              {lastDeploy && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    lastDeploy.state === "SUCCESSFUL"
                      ? "bg-emerald-500/10 text-emerald-400/70"
                      : lastDeploy.state === "FAILED"
                      ? "bg-red-500/10 text-red-400/70"
                      : "bg-white/[0.04] text-white/30"
                  }`}
                  title={`Last deployed: ${lastDeploy.environment ?? "unknown"} (${lastDeploy.completedAt ? new Date(lastDeploy.completedAt).toLocaleString("en-GB") : ""})`}
                >
                  <Rocket size={9} strokeWidth={1.5} />
                  {lastDeploy.environment?.slice(0, 4)}
                </span>
              )}
            </div>
          </td>
        );
      default:
        return null;
    }
  };

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
      className={`group/row border-b border-white/[0.03] cursor-pointer transition-colors duration-100 ${
        isSelected
          ? "bg-[var(--color-brand-600)]/12 border-l-2 border-l-[var(--color-brand-500)]"
          : isHovered
          ? ticket.flagged ? "bg-[rgba(229,83,75,0.08)]" : "bg-white/[0.02]"
          : ticket.flagged
          ? "bg-[rgba(229,83,75,0.06)]"
          : ""
      } ${isFocused && !isSelected ? "outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40" : ""} ${isRemoved ? "opacity-50" : isInflight ? "opacity-70" : ""}`}
    >
      <DragHandle listeners={dragListeners} attributes={dragAttributes} />

      {/* Checkbox */}
      <td
        className="cursor-pointer select-none py-1.5 pl-1 pr-1"
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
  } = useSortable({ id: props.ticket.key });

  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    ...(isDragging ? { opacity: 0.4, zIndex: 10 } : {}),
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
