"use client";

import type { ComponentProps, Ref } from "react";
import type { Subtask, TicketReadiness, JiraStatus, IssueType, Sprint } from "@/types/ticket";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Checkbox } from "@/components/shared/Checkbox";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
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
  /** Controls the readiness indicator. Defaults to true; subtasks pass false since they have no readiness. */
  showReadiness?: boolean;
  readiness?: TicketReadiness | null;
  onJiraStatusChange?: (status: JiraStatus) => void;
  onReadinessChange?: (readiness: TicketReadiness | null) => void;
  // Optional hover-card edit callbacks, forwarded to the status pill (key already bound by the caller).
  onIssueTypeChange?: (type: IssueType) => void;
  onAssigneeChange?: (user: AssignableUser | null) => void;
  onEpicChange?: (epic: EpicOption | null) => void;
  onSprintChange?: (sprintId: string | null) => void;
  onStoryPointsChange?: (value: number | null) => void;
  onBusinessValueChange?: (value: number | null) => void;
  sprints?: Sprint[];
  /** Override the pill's hover-card data (defaults to the shared ticket hover-data context). */
  hoverData?: ComponentProps<typeof TicketStatusPill>["hoverData"];
  /** Row click. The event is forwarded so callers can read modifier keys (e.g. shift-range select). */
  onSelect?: (key: string, e: React.MouseEvent) => void;
  /** Right-click handler (e.g. to open a move-to-sprint context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Multiselect: renders a leading checkbox when set. */
  selectable?: boolean;
  isChecked?: boolean;
  /** True when this row's ticket is the one open in the detail sidebar. Independent of
      isChecked (queue membership): a row can be active, checked, both, or neither. Mirrors
      the Sprint Board's selected-row highlight and takes visual precedence over checked. */
  isActive?: boolean;
  /** True when any row in the surrounding list is checked (pins the gutter open). */
  someChecked?: boolean;
  onCheckboxClick?: (e: React.MouseEvent) => void;
  /** Keep the checkbox in the content flow (reserved gutter, always visible) instead
      of overlaying the type icon on hover. Used by the refinement select list. */
  inlineCheckbox?: boolean;
  /** Add 6px of vertical breathing room to the row (refinement select list). */
  spacious?: boolean;
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
  showReadiness = true,
  readiness,
  onJiraStatusChange,
  onReadinessChange,
  onIssueTypeChange,
  onAssigneeChange,
  onEpicChange,
  onSprintChange,
  onStoryPointsChange,
  onBusinessValueChange,
  sprints,
  hoverData,
  onSelect,
  onContextMenu,
  selectable = false,
  isChecked = false,
  isActive = false,
  someChecked = false,
  onCheckboxClick,
  inlineCheckbox = false,
  spacious = false,
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
    onSelect(item.key, e);
  };

  const hasPill = (showTypeIcon || showKey || showStatus) && !isPending;
  const showCheckbox = selectable && !isPending;

  // Visual checkbox box, reused by the bulk-mode gutter and the hover overlay.
  const checkboxBox = <Checkbox checked={isChecked} />;

  return (
    <div
      ref={ref}
      style={style}
      className={`group/row relative flex items-center gap-2 ${spacious ? "py-[10px]" : "py-[7px]"} pl-4 pr-3 ${
        onSelect && !isPending ? (isActive ? "cursor-pointer" : "cursor-pointer hover:bg-overlay-subtle") : ""
      } ${isPending ? "opacity-50" : ""} ${
        isActive
          ? "bg-[var(--color-brand-600)]/12 shadow-[inset_3px_0_0_0_var(--color-brand-300)]"
          : isChecked
          ? "bg-[var(--color-brand-500)]/[0.06]"
          : ""
      } ${className}`}
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

      {/* Dedicated checkbox gutter on every row, mirroring the sprint board. Always reserves
          space so content never shifts; the checkbox stays hidden until row hover unless a
          selection is active or inline mode keeps it permanently visible. */}
      {showCheckbox && (
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCheckboxClick?.(e); }}
          className={`flex shrink-0 cursor-pointer items-center justify-center transition-opacity duration-150 ${
            isChecked || someChecked || inlineCheckbox ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
          }`}
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

      {hasPill && (
        <span className="relative flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <TicketStatusPill
            ticketKey={item.key}
            jiraStatus={item.jiraStatus}
            issueType={showTypeIcon ? item.type : undefined}
            showReadiness={showReadiness}
            readiness={readiness}
            onJiraStatusChange={onJiraStatusChange}
            onReadinessChange={onReadinessChange}
            onIssueTypeChange={onIssueTypeChange}
            onAssigneeChange={onAssigneeChange}
            onEpicChange={onEpicChange}
            onSprintChange={onSprintChange}
            onStoryPointsChange={onStoryPointsChange}
            onBusinessValueChange={onBusinessValueChange}
            sprints={sprints}
            title={item.title}
            variant="list"
            size="lg"
            showKey={showKey}
            showStatus={showStatus}
            hoverData={hoverData ?? getHoverData(item.key)}
          />
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

      {/* Lifted above the actions overlay (z-20) and click-isolated so an interactive
          metadata control (e.g. the assignee picker) stays reachable on hover and its
          clicks never bubble up to row-select. */}
      {metadataSlot && (
        <span className="relative z-20 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {metadataSlot}
        </span>
      )}

      {/* Hover overlay: actions float over content from the right. When a metadata
          control occupies the right edge, the overlay stops short of it (right-9) so
          the avatar/picker stays visible and clickable; otherwise it hugs the edge. */}
      {!isPending && !isEditing && actionsSlot && (
        <div
          className={`absolute ${metadataSlot ? "right-9" : "right-1"} top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md pl-6 pr-2 opacity-0 group-hover/row:opacity-100`}
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
