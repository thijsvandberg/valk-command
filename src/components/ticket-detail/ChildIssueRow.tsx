"use client";

import type { Ref } from "react";
import type { Subtask, TicketReadiness } from "@/types/ticket";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Loader2 } from "lucide-react";

interface ChildIssueRowProps {
  ref?: Ref<HTMLDivElement>;
  item: Subtask;
  isLast: boolean;
  isPending?: boolean;
  showTypeIcon?: boolean;
  showPill?: boolean;
  readiness?: TicketReadiness | null;
  onSelect?: (key: string) => void;
  /** Inline editing support */
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  /** Slot for extra metadata (story points, sprint, subtask count, etc.) */
  metadataSlot?: React.ReactNode;
  /** Slot for row-level actions (edit, delete buttons shown on hover) */
  actionsSlot?: React.ReactNode;
  /** Slot for drag handle (left of content) */
  dragHandleSlot?: React.ReactNode;
  /** DnD transform/transition styles from useSortable */
  style?: React.CSSProperties;
  /** Extra class names (e.g. for dragging state) */
  className?: string;
  /** DnD attributes to spread on the row when no drag handle */
  dndProps?: Record<string, unknown>;
}

export function ChildIssueRow({
  ref,
  item,
  isLast,
  isPending = false,
  showTypeIcon = false,
  showPill = true,
  readiness,
  onSelect,
  isEditing = false,
  editValue = "",
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  metadataSlot,
  actionsSlot,
  dragHandleSlot,
  style,
  className = "",
  dndProps,
}: ChildIssueRowProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (isPending || !onSelect) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(`/tickets/${item.key}`, "_blank");
      return;
    }
    e.preventDefault();
    onSelect(item.key);
  };

  return (
    <div
      ref={ref}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2.5 ${
        onSelect && !isPending ? "cursor-pointer hover:bg-overlay-subtle" : ""
      } ${!isLast ? "border-b border-border-subtle" : ""} ${
        isPending ? "opacity-50" : ""
      } ${className}`}
      onClick={handleClick}
      {...(dndProps ?? {})}
    >
      {dragHandleSlot}

      {showPill && (
        isPending ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" />
          </span>
        ) : (
          <span onClick={(e) => e.stopPropagation()}>
            <TicketStatusPill
              ticketKey={item.key}
              jiraStatus={item.jiraStatus}
              issueType={showTypeIcon ? item.type : undefined}
              readiness={readiness}
              title={item.title}
              size="sm"
            />
          </span>
        )
      )}

      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSaveEdit?.(); }
            if (e.key === "Escape") { e.preventDefault(); onCancelEdit?.(); }
          }}
          onBlur={onSaveEdit}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none border-b border-[var(--color-brand-400)]"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
          {item.title}
        </span>
      )}

      {metadataSlot}

      {!isPending && !isEditing && actionsSlot}
    </div>
  );
}
