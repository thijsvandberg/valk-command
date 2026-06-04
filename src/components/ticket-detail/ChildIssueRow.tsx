"use client";

import type { Ref } from "react";
import type { Subtask, TicketReadiness, JiraStatus, IssueType } from "@/types/ticket";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { useTicketHoverData } from "@/hooks/useTicketHoverData";
import { Loader2 } from "lucide-react";

interface ChildIssueRowProps {
  ref?: Ref<HTMLDivElement>;
  item: Subtask;
  isLast: boolean;
  isPending?: boolean;
  showTypeIcon?: boolean;
  showKey?: boolean;
  showStatus?: boolean;
  readiness?: TicketReadiness | null;
  onJiraStatusChange?: (status: JiraStatus) => void;
  onReadinessChange?: (readiness: TicketReadiness | null) => void;
  onSelect?: (key: string) => void;
  /** Right-click handler (e.g. to open a move-to-sprint context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Multiselect: renders a leading checkbox when set. */
  selectable?: boolean;
  isChecked?: boolean;
  /** True when any row in the surrounding list is checked (pins the gutter open). */
  someChecked?: boolean;
  onCheckboxClick?: (e: React.MouseEvent) => void;
  /** Inline editing support */
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  /** Slot for extra metadata (story points, sprint, subtask count, assignee, etc.) */
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
  isPending = false,
  showTypeIcon = false,
  showKey = true,
  showStatus = true,
  readiness,
  onJiraStatusChange,
  onReadinessChange,
  onSelect,
  onContextMenu,
  selectable = false,
  isChecked = false,
  someChecked = false,
  onCheckboxClick,
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
  const getHoverData = useTicketHoverData();

  const handleClick = (e: React.MouseEvent) => {
    if (isPending || !onSelect) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(`/tickets/${item.key}`, "_blank");
      return;
    }
    e.preventDefault();
    onSelect(item.key);
  };

  const hasPill = (showKey || showStatus) && !isPending;
  const showCheckbox = selectable && !isPending;

  // Visual checkbox box, reused by the bulk-mode gutter and the hover overlay.
  const checkboxBox = (
    <span
      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
        isChecked
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
          : "border-border-default bg-overlay-subtle"
      }`}
    >
      {isChecked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );

  return (
    <div
      ref={ref}
      style={style}
      className={`group/row relative flex items-center gap-2 py-2 pl-4 pr-3 ${
        onSelect && !isPending ? "cursor-pointer hover:bg-overlay-subtle" : ""
      } ${isPending ? "opacity-50" : ""} ${isChecked ? "bg-[var(--color-brand-500)]/[0.06]" : ""} ${className}`}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      {...(dndProps ?? {})}
    >
      {/* Drag handle sits in the left gutter, over the row's leading edge (Jira-style),
          so it never pushes the content right. Hidden during multiselect. */}
      {dragHandleSlot && !someChecked && (
        <span className="absolute left-0 top-1/2 z-10 flex h-6 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border-subtle bg-[var(--color-surface-elevated)] text-text-tertiary opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
          {dragHandleSlot}
        </span>
      )}

      {/* Bulk mode: dedicated checkbox gutter on every row, mirroring the sprint board. */}
      {showCheckbox && someChecked && (
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCheckboxClick?.(e); }}
          className="flex shrink-0 cursor-pointer items-center justify-center"
          role="checkbox"
          aria-checked={isChecked}
          aria-label={`Select ${item.key}`}
        >
          {checkboxBox}
        </span>
      )}

      {isPending && (showKey || showStatus) && (
        <span className="flex items-center gap-1.5 font-mono text-body-sm text-text-muted">
          <Loader2 size={10} className="animate-spin" />
        </span>
      )}

      {(hasPill || (showCheckbox && !someChecked)) && (
        <span className="relative flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {/* Default view: the hover checkbox takes the leading type icon's place (the icon fades
              via dimTypeOnRowHover), so no extra gutter is reserved and content never shifts. */}
          {showCheckbox && !someChecked && (
            <span
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onCheckboxClick?.(e); }}
              className="absolute left-1 top-1/2 z-10 flex -translate-y-1/2 cursor-pointer items-center opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={`Select ${item.key}`}
            >
              {checkboxBox}
            </span>
          )}
          {hasPill && (
            <TicketStatusPill
              ticketKey={item.key}
              jiraStatus={item.jiraStatus}
              issueType={showTypeIcon ? item.type : undefined}
              readiness={readiness}
              onJiraStatusChange={onJiraStatusChange}
              onReadinessChange={onReadinessChange}
              title={item.title}
              variant="list"
              size="lg"
              showKey={showKey}
              showStatus={showStatus}
              dimTypeOnRowHover={showCheckbox && !someChecked}
              hoverData={getHoverData(item.key)}
            />
          )}
        </span>
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
          className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary outline-none border-b border-[var(--color-brand-400)]"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">
          {item.title}
        </span>
      )}

      {metadataSlot}

      {/* Hover overlay: actions float over content from the right */}
      {!isPending && !isEditing && actionsSlot && (
        <div
          className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md pl-6 pr-2 opacity-0 group-hover/row:opacity-100"
          style={{
            transition: "opacity 0.15s ease",
            background: "linear-gradient(to right, transparent, var(--color-surface-base) 24px)",
          }}
        >
          {actionsSlot}
        </div>
      )}
    </div>
  );
}
