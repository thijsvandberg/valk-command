"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, Check } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { useTicketHoverData } from "@/hooks/useTicketHoverData";
import type { JiraStatus } from "@/types/ticket";

export function SessionQueueItem({
  ticketKey,
  title,
  isCurrent,
  isRefined = false,
  issueType,
  jiraStatus,
  onClick,
}: {
  ticketKey: string;
  title: string;
  isCurrent: boolean;
  isRefined?: boolean;
  issueType?: string;
  jiraStatus?: JiraStatus;
  onClick: () => void;
}) {
  const getHoverData = useTicketHoverData();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticketKey });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-full items-center gap-2 px-3 py-2 hover:bg-hover-list-item active:bg-overlay-default ${
        isCurrent ? "bg-overlay-subtle" : ""
      } ${isDragging ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg" : ""} ${
        isRefined ? "opacity-80" : ""
      }`}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab text-text-muted opacity-40 hover:opacity-100 active:cursor-grabbing"
        style={{ transition: "opacity 0.15s ease" }}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </span>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      >
        {jiraStatus ? (
          <span className="shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <TicketStatusPill
              ticketKey={ticketKey}
              jiraStatus={jiraStatus}
              issueType={issueType}
              title={title}
              variant="list"
              showKey
              showStatus
              hoverData={getHoverData(ticketKey)}
            />
          </span>
        ) : (
          <span className="shrink-0 font-mono text-body-sm text-[var(--color-brand-400)]">{ticketKey}</span>
        )}
        <span className={`min-w-0 flex-1 truncate text-body-sm ${isRefined ? "text-text-muted line-through decoration-text-muted/30" : "text-text-secondary"}`}>{title}</span>
        {isRefined ? (
          <Check size={12} strokeWidth={2} className="shrink-0 text-[var(--color-status-success)]" />
        ) : isCurrent ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
        ) : null}
      </button>
    </div>
  );
}
