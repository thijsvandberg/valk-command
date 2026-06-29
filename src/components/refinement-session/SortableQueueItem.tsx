"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, X, ArrowRightLeft, Sparkles } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EditStateDot } from "@/components/sprint-board/TicketTableCells";
import type { Ticket } from "@/types/ticket";
import { MetricBadge } from "@/components/shared/MetricBadge";
import type { RefinementSessionResponse } from "@/lib/api-client";
import { sessionLabel } from "./refinement-utils";

export interface SortableQueueItemProps {
  ticket: Ticket;
  onRemove: (key: string) => void;
  otherSessions?: RefinementSessionResponse[];
  onMoveToSession?: (ticketKey: string, targetSessionId: string) => void;
  suggestionCount?: number;
}

export function SortableQueueItem({
  ticket,
  onRemove,
  otherSessions,
  onMoveToSession,
  suggestionCount,
}: SortableQueueItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.key,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick(menuRef, () => setMenuOpen(false), { enabled: menuOpen });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : menuOpen ? 5 : undefined,
    position: "relative" as const,
  };

  const hasOtherSessions = otherSessions && otherSessions.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 ${
        isDragging
          ? "bg-surface-floating shadow-lg"
          : "bg-overlay-subtle hover:bg-overlay-default"
      }`}
    >
      {/* Drag handle floats in the left gutter, half outside the row (mirrors ChildIssueRow),
          so it never pushes the content right and only appears on hover. */}
      <span className="absolute left-0 top-1/2 z-10 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-surface-elevated text-text-tertiary opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <span
          className="flex cursor-grab items-center hover:!opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${ticket.key} to reorder`}
        >
          <GripVertical size={12} strokeWidth={1.5} />
        </span>
      </span>
      <IssueTypeIcon type={ticket.type} size={14} />
      {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
      {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
      <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">{ticket.title}</span>
      {ticket.storyPoints != null && (
        <MetricBadge metric="sp" value={ticket.storyPoints} tinted size="xs" />
      )}

      {/* Subtask suggestion count badge */}
      {suggestionCount != null && suggestionCount > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-brand-500)]/[0.08] px-1.5 py-0.5 text-caption font-medium tabular-nums text-[var(--color-brand-400)]"
          title={`${suggestionCount} subtask suggestion${suggestionCount !== 1 ? "s" : ""}`}
        >
          <Sparkles size={9} strokeWidth={2.5} />
          {suggestionCount}
        </span>
      )}

      {/* Hover overlay: actions float over content from the right */}
      <div
        className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md pl-6 pr-2 ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{
          transition: "opacity 0.15s ease",
          background: isDragging
            ? "linear-gradient(to right, transparent, var(--color-surface-floating) 24px)"
            : "linear-gradient(to right, transparent, var(--color-surface-base) 24px)",
        }}
      >
        {/* Move to another session */}
        {hasOtherSessions && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              aria-label="Move to another session"
            >
              <ArrowRightLeft size={13} strokeWidth={2} />
              <span>Move</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border-strong bg-surface-elevated py-1 shadow-lg">
                <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
                  Move to
                </div>
                {otherSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveToSession?.(ticket.key, s.id);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{sessionLabel(s)}</span>
                    <span className="shrink-0 text-caption tabular-nums text-text-muted">{s.ticketCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onRemove(ticket.key)}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          aria-label={`Remove ${ticket.key} from queue`}
        >
          <X size={14} strokeWidth={2} />
          <span>Remove</span>
        </button>
      </div>
    </div>
  );
}
