"use client";

import type { Ref } from "react";
import type { Subtask } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { TicketKeyPill } from "@/components/shared/TicketKeyPill";
import { Loader2 } from "lucide-react";

interface ChildIssueRowProps {
  ref?: Ref<HTMLDivElement>;
  item: Subtask;
  isLast: boolean;
  isPending?: boolean;
  showTypeIcon?: boolean;
  showKey?: boolean;
  onSelect?: (key: string) => void;
  /** Inline editing support */
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onStartEdit?: () => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  /** Slot for extra metadata (story points, sprint, subtask count, status badge, etc.) */
  metadataSlot?: React.ReactNode;
  /** Slot for row-level actions (delete button, etc.) */
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
  showKey = true,
  onSelect,
  isEditing = false,
  editValue = "",
  onEditChange,
  onStartEdit,
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

      {showTypeIcon && <IssueTypeIcon type={item.type} size={14} />}

      {showKey && (
        isPending ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" />
          </span>
        ) : (
          <TicketKeyPill ticketKey={item.key} />
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
        <span
          className={`min-w-0 flex-1 truncate text-sm text-text-secondary ${
            !isPending && onStartEdit ? "cursor-text hover:text-text-primary" : ""
          }`}
          onClick={!isPending && onStartEdit ? (e: React.MouseEvent) => { e.stopPropagation(); onStartEdit(); } : undefined}
          style={{ transition: "color 0.15s ease" }}
        >
          {item.title}
        </span>
      )}

      {metadataSlot}

      {!isPending && !isEditing && actionsSlot}
    </div>
  );
}
