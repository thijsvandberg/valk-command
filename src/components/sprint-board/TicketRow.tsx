"use client";

import { forwardRef } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import { getEpicColor, JIRA_STATUS_COLORS } from "@/types/ticket";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { GripVertical, Flag, MessageSquare } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditStateDot, QualityBadge, POStatusCell } from "@/components/sprint-board/TicketTableCells";

function DragHandle({ listeners, attributes }: { listeners?: ReturnType<typeof useSortable>["listeners"]; attributes?: ReturnType<typeof useSortable>["attributes"] }) {
  if (!listeners) {
    return <td className="w-5 py-2 pl-1 pr-0" />;
  }
  return (
    <td
      className="w-5 py-2 pl-1 pr-0 opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing"
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
  someChecked: boolean;
  isDragActive: boolean;
  col: (id: ColumnId) => boolean;
  showSprintColumn: boolean;
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
    someChecked,
    isDragActive,
    col,
    showSprintColumn,
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
    rowStyle,
    dragListeners,
    dragAttributes,
    "data-index": dataIndex,
  },
  ref
) {
  const showCheckbox = isChecked || isHovered || someChecked;
  const epicColor = ticket.epic ? getEpicColor(ticket.epic) ?? null : null;
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? { bg: "rgba(148, 163, 184, 0.08)", text: "#64748b" };

  const style: React.CSSProperties = {
    ...(ticket.flagged ? { boxShadow: "inset 4px 0 0 #e5534b" } : {}),
    ...rowStyle,
  };

  return (
    <tr
      ref={ref}
      data-index={dataIndex}
      style={style}
      onMouseEnter={() => onHoverRow(ticket.key)}
      onMouseLeave={onLeaveRow}
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
      } ${isFocused && !isSelected ? "outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40" : ""}`}
    >
      <DragHandle listeners={dragListeners} attributes={dragAttributes} />

      {/* Checkbox */}
      <td
        className="cursor-pointer select-none py-2 pl-1 pr-1"
        onClick={(e) => {
          e.stopPropagation();
          onCheckboxClick(ticket.key, ticketIdx, e.shiftKey);
        }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center transition-opacity duration-100"
          style={{ opacity: showCheckbox ? 1 : 0 }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="pointer-events-none h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)]"
          />
        </div>
      </td>

      {col("type") && (
        <td className="py-2 pr-2">
          <IssueTypeIcon type={ticket.type} />
        </td>
      )}

      {col("key") && (
        <td className="py-2 pr-3 font-mono text-xs text-white/50">
          <span className="flex items-center gap-1.5">
            {ticket.key}
            {ticket.editState === "draft" && <EditStateDot state="draft" />}
            {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
            {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
          </span>
        </td>
      )}

      {col("title") && (
        <td className="max-w-0 truncate py-2 pr-3 text-white/80">
          {ticket.title}
        </td>
      )}

      {col("epic") && (
        <td className="py-2 pr-3">
          {epicColor && (
            <span
              className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
            >
              {ticket.epic}
            </span>
          )}
        </td>
      )}

      {col("jiraStatus") && (
        <td className="py-2 pr-3">
          <span
            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
          >
            {ticket.jiraStatus}
          </span>
        </td>
      )}

      {showSprintColumn && (
        <td className="py-2 pr-3 text-xs text-white/35 truncate max-w-[140px]">
          {ticket.sprintId
            ? (sprintNameMap[ticket.sprintId] ?? ticket.sprintId)
            : <span className="text-white/15">—</span>}
        </td>
      )}

      {col("points") && (
        <td className="py-2 pr-3 text-center tabular-nums text-white/30">
          {ticket.storyPoints ?? "-"}
        </td>
      )}

      {col("assignee") && (
        <td className="py-2 pr-3">
          <Avatar assignee={ticket.assignee} />
        </td>
      )}

      {col("flagged") && (
        <td className="py-2 pr-2">
          {ticket.flagged && <Flag className="h-3.5 w-3.5 text-[#e5534b]" fill="currentColor" strokeWidth={0} />}
        </td>
      )}

      {col("poStatus") && (
        <td
          className="py-2 pr-2 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <POStatusCell
            value={poStatuses[ticket.key] ?? null}
            onChange={(v) => onPoStatusChange(ticket.key, v)}
          />
        </td>
      )}

      {col("quality") && (
        <td
          className="py-2 pr-3 text-xs tabular-nums"
          onClick={(e) => e.stopPropagation()}
        >
          <QualityBadge
            score={ticket.qualityScore}
            ticketKey={ticket.key}
            isPopoverOpen={reviewPopoverKey === ticket.key}
            onTogglePopover={() => onToggleReviewPopover(ticket.key)}
          />
        </td>
      )}

      {col("notes") && (
        <td className="py-2 pr-5">
          {ticket.notes && (
            <span title={ticket.notes}>
              <MessageSquare className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
            </span>
          )}
        </td>
      )}
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
