"use client";

import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import { EPIC_COLORS, getEpicColor, PO_STATUS_OPTIONS, JIRA_STATUS_COLORS } from "@/types/ticket";
import { PO_STATUS_COLORS, type ColumnId } from "./FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Minus, Sparkles, Pencil, CircleDot, Check, Pause, GripVertical, Flag, MessageSquare, Sheet, Clock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { ReviewPopover } from "./ReviewPopover";
import type { SortField, SortDir } from "./FilterBar";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT_ESTIMATE = 40;
const VIRTUALIZER_OVERSCAN = 20;

type EditState = "draft" | "local_edits" | "conflict";

const EDIT_STATE_CONFIG: Record<EditState, { dotClass: string; accent: string; label: string; description: string }> = {
  draft: {
    dotClass: "bg-[#4a90d9]/40",
    accent: "#4a90d9",
    label: "Unsaved draft",
    description: "A draft is in progress but has not been saved to Jira yet.",
  },
  local_edits: {
    dotClass: "bg-[#4a90d9]/70",
    accent: "#4a90d9",
    label: "Local changes",
    description: "This ticket has local edits that are pending sync to Jira.",
  },
  conflict: {
    dotClass: "bg-[#ea8744]/70",
    accent: "#ea8744",
    label: "Conflict",
    description: "Jira was updated after your local edit. Review and resolve before saving.",
  },
};

function EditStateDot({ state }: { state: EditState }) {
  const cfg = EDIT_STATE_CONFIG[state];
  return (
    <span className="group/dot relative inline-flex cursor-default">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotClass}`} />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 w-48 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover/dot:opacity-100"
        role="tooltip"
      >
        {/* Arrow */}
        <span
          className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45"
          style={{
            backgroundColor: "rgb(22,22,34)",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        />
        {/* Panel */}
        <span
          className="font-sans relative flex flex-col overflow-hidden rounded-lg"
          style={{
            backgroundColor: "rgb(22,22,34)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {/* Accent top bar */}
          <span className="h-[2px] w-full shrink-0" style={{ backgroundColor: cfg.accent, opacity: 0.6 }} />
          <span className="flex flex-col gap-1 px-3 py-2.5">
            <span className="text-[11px] font-semibold tracking-wide text-white/90">{cfg.label}</span>
            <span className="text-[10.5px] leading-relaxed text-white/40">{cfg.description}</span>
          </span>
        </span>
      </span>
    </span>
  );
}

// Build external Jira URL for a given ticket key
function getJiraUrl(ticketKey: string): string {
  const base =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_JIRA_BASE_URL) ||
    "https://new-story.atlassian.net";
  return `${base.replace(/\/$/, "")}/browse/${ticketKey}`;
}

export { getJiraUrl };


// -- Quality score badge (clickable to show review popover) --

function QualityBadge({
  score,
  ticketKey,
  isPopoverOpen,
  onTogglePopover,
}: {
  score: number | null;
  ticketKey?: string;
  isPopoverOpen?: boolean;
  onTogglePopover?: () => void;
}) {
  let color: string | undefined;
  if (score !== null) {
    if (score < 60) color = "#e5534b";
    else if (score < 75) color = "#ea8744";
    else if (score < 90) color = "#eab308";
    else color = "#4aaa60";
  }

  const content = score === null ? (
    <span className="text-white/15">--</span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      style={{ color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {score}
    </span>
  );

  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!ticketKey || !onTogglePopover) {
    return <span title={score !== null ? `Quality: ${score}/100` : undefined}>{content}</span>;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePopover();
        }}
        className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08]"
        title={score !== null ? `Quality: ${score}/100` : "No review"}
      >
        {content}
      </button>
      {isPopoverOpen && (
        <ReviewPopover
          ticketKey={ticketKey}
          score={score}
          onClose={onTogglePopover}
          anchorRef={buttonRef}
        />
      )}
    </>
  );
}

export { QualityBadge };

// -- PO Status icon per status --

function POStatusIcon({ status, size = 14 }: { status: POStatus; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.5 };
  if (!status) return <Minus {...props} opacity={0.25} />;
  switch (status) {
    case "Nieuw": return <Sparkles {...props} />;
    case "Uitwerken": return <Pencil {...props} />;
    case "Wachten op feedback": return <Clock {...props} />;
    case "Klaar voor refinement": return <CircleDot {...props} />;
    case "Ready": return <Check {...props} />;
    case "Geparkeerd": return <Pause {...props} />;
  }
}

export { POStatusIcon };

// -- PO Status inline dropdown --

export function POStatusCell({
  value,
  onChange,
  showLabel = false,
}: {
  value: POStatus;
  onChange: (v: POStatus) => void;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const colors = value ? PO_STATUS_COLORS[value] : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08] ${
          showLabel ? "h-8 px-2.5 py-1" : "h-7 w-7 justify-center"
        }`}
        style={{ color: colors?.text || "rgba(255,255,255,0.2)" }}
        title={value || "No status"}
      >
        <POStatusIcon status={value} />
        {showLabel && (
          <span className="text-xs font-medium" style={{ color: colors?.text || "rgba(255,255,255,0.35)" }}>
            {value || "No status"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {PO_STATUS_OPTIONS.map((opt) => {
            const optColors = opt.value ? PO_STATUS_COLORS[opt.value] : null;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06] ${
                  opt.value === value ? "text-white" : "text-white/60"
                }`}
              >
                <span style={{ color: optColors?.text || "rgba(255,255,255,0.25)" }}>
                  <POStatusIcon status={opt.value} size={13} />
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Drag handle (visible on hover) --

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

// -- Shared row props --

interface TicketRowBaseProps {
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

// -- Ticket row (forwardRef for virtualizer measurement) --

const TicketRow = forwardRef<HTMLTableRowElement, TicketRowBaseProps>(function TicketRow(
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

// -- Sortable row wrapper (used when drag-and-drop is enabled) --

function SortableTicketRow(props: Omit<TicketRowBaseProps, "rowStyle" | "dragListeners" | "dragAttributes" | "data-index">) {
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

// -- Ticket table --

// Sort indicator shown next to sortable column headers
function SortIndicator({
  colId,
  sortField,
  sortDir,
  isSortable,
}: {
  colId: ColumnId;
  sortField?: SortField;
  sortDir?: SortDir;
  isSortable: boolean;
}) {
  if (!isSortable) return null;
  const field = COLUMN_SORT_FIELDS[colId];
  if (!field) return null;
  if (field !== sortField) {
    return <ArrowUpDown className="ml-1 h-3 w-3 opacity-0 group-hover/th:opacity-30" strokeWidth={1.5} />;
  }
  return sortDir === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />
    : <ArrowDown className="ml-1 h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />;
}

// Maps column IDs to their corresponding sort fields
const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, SortField>> = {
  key: "key",
  title: "title",
  epic: "epic",
  jiraStatus: "jiraStatus",
  points: "points",
  assignee: "assignee",
  poStatus: "poStatus",
  quality: "quality",
};

// Default sort direction per sort field
function defaultSortDir(field: SortField): SortDir {
  return field === "quality" || field === "points" || field === "lastChanged" ? "desc" : "asc";
}

export function TicketTable({
  tickets,
  checkedTickets,
  selectedTicket,
  hoveredRow,
  focusedTicketIdx,
  someChecked,
  allChecked,
  visibleColumns,
  showSprintColumn,
  sprintNameMap,
  poStatuses,
  onToggleCheck,
  onRangeCheck,
  onToggleAll,
  onSelectTicket,
  onHoverRow,
  onLeaveRow,
  onPoStatusChange,
  onTableKeyDown,
  onReorder,
  sortField,
  sortDir,
  onSortChange,
}: {
  tickets: Ticket[];
  checkedTickets: Set<string>;
  selectedTicket: string | null;
  hoveredRow: string | null;
  focusedTicketIdx: number;
  someChecked: boolean;
  allChecked: boolean;
  visibleColumns: Set<ColumnId>;
  showSprintColumn?: boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses: Record<string, POStatus>;
  onToggleCheck: (key: string) => void;
  onRangeCheck: (keys: string[], checked: boolean) => void;
  onToggleAll: () => void;
  onSelectTicket: (key: string | null) => void;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
  onTableKeyDown: (e: React.KeyboardEvent) => void;
  onReorder?: (activeKey: string, overKey: string) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: SortField, dir: SortDir) => void;
}) {
  const col = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  // Tracks the last checkbox interaction for shift+click range selection
  const lastCheckRef = useRef<{ idx: number; checked: boolean } | null>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reviewPopoverKey, setReviewPopoverKey] = useState<string | null>(null);

  // Clicking a sortable column header toggles direction if already active, else sets with default direction
  const handleColumnSort = useCallback((colId: ColumnId) => {
    const field = COLUMN_SORT_FIELDS[colId];
    if (!field || !onSortChange) return;
    if (field === sortField) {
      onSortChange(field, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(field, defaultSortDir(field));
    }
  }, [sortField, sortDir, onSortChange]);

  const handleToggleReviewPopover = useCallback((key: string) => {
    setReviewPopoverKey((prev) => (prev === key ? null : key));
  }, []);

  const handleCheckboxClick = useCallback((key: string, idx: number, shiftKey: boolean) => {
    const anchor = lastCheckRef.current;
    if (shiftKey && anchor !== null) {
      const from = Math.min(anchor.idx, idx);
      const to = Math.max(anchor.idx, idx);
      const rangeKeys = tickets.slice(from, to + 1).map((t) => t.key);
      onRangeCheck(rangeKeys, anchor.checked);
      // Keep anchor so repeated shift+clicks extend from the same point
    } else {
      const willBeChecked = !checkedTickets.has(key);
      lastCheckRef.current = { idx, checked: willBeChecked };
      onToggleCheck(key);
    }
  }, [tickets, checkedTickets, onToggleCheck, onRangeCheck]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      onReorder(active.id as string, over.id as string);
    }
  }, [onReorder]);

  const enableVirtualization = tickets.length > VIRTUALIZE_THRESHOLD;
  const ticketIds = tickets.map((t) => t.key);
  const activeTicket = activeDragId ? tickets.find((t) => t.key === activeDragId) : null;

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: enableVirtualization ? tickets.length : 0,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: VIRTUALIZER_OVERSCAN,
  });

  const virtualRows = enableVirtualization ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // Shared row props factory to avoid repetition between virtualized and non-virtualized paths
  const makeRowProps = useCallback((ticket: Ticket, ticketIdx: number) => ({
    ticket,
    ticketIdx,
    isChecked: checkedTickets.has(ticket.key),
    isHovered: hoveredRow === ticket.key,
    isSelected: selectedTicket === ticket.key,
    isFocused: focusedTicketIdx === ticketIdx,
    someChecked,
    isDragActive: activeDragId !== null,
    col,
    showSprintColumn: showSprintColumn ?? false,
    sprintNameMap: sprintNameMap ?? {},
    poStatuses,
    selectedTicket,
    onHoverRow,
    onLeaveRow,
    onSelectTicket,
    onCheckboxClick: handleCheckboxClick,
    onPoStatusChange,
    reviewPopoverKey,
    onToggleReviewPopover: handleToggleReviewPopover,
  }), [checkedTickets, hoveredRow, selectedTicket, focusedTicketIdx, someChecked, activeDragId, col, showSprintColumn, sprintNameMap, poStatuses, onHoverRow, onLeaveRow, onSelectTicket, handleCheckboxClick, onPoStatusChange, reviewPopoverKey, handleToggleReviewPopover]);

  const theadContent = (
    <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
      <tr className="group/thead border-b border-white/[0.06] text-left text-xs font-medium text-white/30">
        <th className="w-5 py-2.5 pl-1" />
        <th className="w-10 py-2.5 pl-1 pr-1">
          <div
            className={`flex h-6 w-6 items-center justify-center transition-opacity duration-100 ${
              someChecked ? "opacity-100" : "opacity-0 group-hover/thead:opacity-100"
            }`}
          >
            <input
              type="checkbox"
              checked={allChecked}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)] cursor-pointer"
              ref={(el) => {
                if (el) el.indeterminate = someChecked && !allChecked;
              }}
            />
          </div>
        </th>
        {col("type") && <th className="w-8 py-2.5 pr-2" />}
        {col("key") && (
          <th className="group/th w-24 py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("key")} className="flex items-center cursor-pointer hover:text-white/60">
              Key<SortIndicator colId="key" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("title") && (
          <th className="group/th py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("title")} className="flex items-center cursor-pointer hover:text-white/60">
              Title<SortIndicator colId="title" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("epic") && (
          <th className="group/th w-36 py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("epic")} className="flex items-center cursor-pointer hover:text-white/60">
              Epic<SortIndicator colId="epic" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("jiraStatus") && (
          <th className="group/th w-28 py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("jiraStatus")} className="flex items-center cursor-pointer hover:text-white/60">
              Status<SortIndicator colId="jiraStatus" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {showSprintColumn && <th className="w-36 py-2.5 pr-3">Sprint</th>}
        {col("points") && (
          <th className="group/th w-12 py-2.5 pr-3 text-center">
            <button type="button" onClick={() => handleColumnSort("points")} className="flex items-center justify-center w-full cursor-pointer hover:text-white/60">
              Pts<SortIndicator colId="points" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("assignee") && (
          <th className="group/th w-10 py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("assignee")} className="flex items-center cursor-pointer hover:text-white/60">
              <SortIndicator colId="assignee" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("flagged") && <th className="w-8 py-2.5 pr-2" />}
        {col("poStatus") && (
          <th className="group/th w-10 py-2.5 pr-2 text-center">
            <button type="button" onClick={() => handleColumnSort("poStatus")} className="flex items-center justify-center w-full cursor-pointer hover:text-white/60">
              PO<SortIndicator colId="poStatus" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("quality") && (
          <th className="group/th w-16 py-2.5 pr-3">
            <button type="button" onClick={() => handleColumnSort("quality")} className="flex items-center cursor-pointer hover:text-white/60">
              Quality<SortIndicator colId="quality" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("notes") && <th className="w-8 py-2.5 pr-5" />}
      </tr>
    </thead>
  );

  const virtualizedTable = (
    <table className="w-full border-collapse text-sm">
      {theadContent}
      <tbody>
        {paddingTop > 0 && (
          <tr><td style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
        )}
        {virtualRows.map((virtualRow) => {
          const ticket = tickets[virtualRow.index];
          return (
            <TicketRow
              key={ticket.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              {...makeRowProps(ticket, virtualRow.index)}
            />
          );
        })}
        {paddingBottom > 0 && (
          <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
        )}
      </tbody>
    </table>
  );

  const dndTable = (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <table className="w-full border-collapse text-sm">
        {theadContent}
        <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
          <tbody>
            {tickets.map((ticket, ticketIdx) => (
              <SortableTicketRow
                key={ticket.key}
                {...makeRowProps(ticket, ticketIdx)}
              />
            ))}
          </tbody>
        </SortableContext>
      </table>
      <DragOverlay>
        {activeTicket && (
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="bg-[var(--color-surface-elevated)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-lg border border-white/[0.08]">
                <td className="w-5 py-2 pl-1" />
                <td className="py-2 pl-1 pr-1">
                  <div className="flex h-6 w-6 items-center justify-center" />
                </td>
                {col("type") && (
                  <td className="py-2 pr-2">
                    <IssueTypeIcon type={activeTicket.type} />
                  </td>
                )}
                {col("key") && (
                  <td className="py-2 pr-3 font-mono text-xs text-white/50">
                    {activeTicket.key}
                  </td>
                )}
                {col("title") && (
                  <td className="max-w-0 truncate py-2 pr-3 text-white/80">
                    {activeTicket.title}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        )}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div
      ref={tableContainerRef}
      className="flex-1 overflow-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={onTableKeyDown}
    >
      {enableVirtualization ? virtualizedTable : dndTable}
      {tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sheet className="mb-4 h-12 w-12 text-white/10" strokeWidth={1} />
          <p className="text-sm font-medium text-white/30">No tickets in this sprint</p>
          <p className="mt-1 text-xs text-white/15">Tickets will appear here once they are added to the sprint in Jira</p>
        </div>
      )}
    </div>
  );
}
