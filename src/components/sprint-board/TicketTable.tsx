"use client";

import { useState, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import type { ColumnId, SortField, SortDir } from "@/components/sprint-board/FilterBar";
import { COLUMNS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArrowUp, ArrowDown, ArrowUpDown, Sheet } from "lucide-react";
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
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TicketRow, SortableTicketRow } from "@/components/sprint-board/TicketRow";
import { POStatusCell, QualityBadge, POStatusIcon, EditStateDot, getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { DEFAULT_COLUMN_WIDTHS } from "@/hooks/useColumnWidths";

export { POStatusCell, QualityBadge, POStatusIcon, EditStateDot, getJiraUrl };

// -- Resize handle for column headers --

function ResizeHandle({
  colId,
  onResize,
  onReset,
}: {
  colId: string;
  onResize: (colId: string, width: number) => void;
  onReset: (colId: string) => void;
}) {
  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest("th");
    if (!th) return;
    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(24, startWidth + ev.clientX - startX);
      onResize(colId, Math.round(newWidth));
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [colId, onResize]);

  const handleDoubleClick = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onReset(colId);
  }, [colId, onReset]);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/resize"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="absolute right-0 top-1 bottom-1 w-px bg-white/0 group-hover/resize:bg-white/20 transition-colors duration-100" />
    </div>
  );
}

const VIRTUALIZE_THRESHOLD = 80;
const ROW_HEIGHT_ESTIMATE = 32;
const VIRTUALIZER_OVERSCAN = 20;

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
  sprintNameMap,
  poStatuses,
  inflightKeys,
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
  columnOrder,
  columnWidths,
  onColumnResize,
  onColumnResetWidth,
}: {
  tickets: Ticket[];
  checkedTickets: Set<string>;
  selectedTicket: string | null;
  hoveredRow: string | null;
  focusedTicketIdx: number;
  someChecked: boolean;
  allChecked: boolean;
  visibleColumns: Set<ColumnId>;
  sprintNameMap?: Record<string, string>;
  poStatuses: Record<string, POStatus>;
  inflightKeys?: Set<string>;
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
  columnOrder?: ColumnId[];
  columnWidths?: Record<string, number>;
  onColumnResize?: (colId: string, width: number) => void;
  onColumnResetWidth?: (colId: string) => void;
}) {
  const col = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);
  const colW = useCallback((id: string): number | undefined => {
    return columnWidths?.[id] ?? DEFAULT_COLUMN_WIDTHS[id] ?? undefined;
  }, [columnWidths]);
  const DEFAULT_ORDER: ColumnId[] = useMemo(() => COLUMNS.map((c) => c.id), []);
  const effectiveOrder = columnOrder ?? DEFAULT_ORDER;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const lastCheckRef = useRef<{ idx: number; checked: boolean } | null>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reviewPopoverKey, setReviewPopoverKey] = useState<string | null>(null);

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
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Reset scroll position when sort or filter changes
  const prevSortRef = useRef({ sortField, sortDir, ticketCount: tickets.length });
  if (enableVirtualization &&
    (prevSortRef.current.sortField !== sortField ||
     prevSortRef.current.sortDir !== sortDir ||
     prevSortRef.current.ticketCount !== tickets.length)) {
    prevSortRef.current = { sortField, sortDir, ticketCount: tickets.length };
    rowVirtualizer.scrollToIndex(0);
  }

  const virtualRows = enableVirtualization ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const makeRowProps = useCallback((ticket: Ticket, ticketIdx: number) => ({
    ticket,
    ticketIdx,
    isChecked: checkedTickets.has(ticket.key),
    isHovered: hoveredRow === ticket.key,
    isSelected: selectedTicket === ticket.key,
    isFocused: focusedTicketIdx === ticketIdx,
    isInflight: inflightKeys?.has(ticket.key) ?? false,
    someChecked,
    isDragActive: activeDragId !== null,
    col,
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
    columnOrder: effectiveOrder,
  }), [checkedTickets, hoveredRow, selectedTicket, focusedTicketIdx, someChecked, activeDragId, col, sprintNameMap, poStatuses, inflightKeys, onHoverRow, onLeaveRow, onSelectTicket, handleCheckboxClick, onPoStatusChange, reviewPopoverKey, handleToggleReviewPopover, effectiveOrder]);

  const rh = onColumnResize && onColumnResetWidth
    ? (id: string) => <ResizeHandle colId={id} onResize={onColumnResize} onReset={onColumnResetWidth} />
    : () => null;

  const HEADER_LABELS: Record<ColumnId, string> = {
    type: "", key: "Key", title: "Title", epic: "Epic",
    jiraStatus: "Status", sprint: "Sprint", points: "Pts", assignee: "",
    flagged: "", poStatus: "PO", quality: "QS", notes: "", pipeline: "",
  };

  const SORTABLE_COLUMNS: Set<ColumnId> = new Set(["key", "title", "epic", "jiraStatus", "points", "assignee", "poStatus", "quality"]);
  const CENTER_COLUMNS: Set<ColumnId> = new Set(["points", "poStatus"]);

  const renderHeaderCell = useCallback((id: ColumnId) => {
    if (!col(id)) return null;

    const label = HEADER_LABELS[id];
    const isSortable = SORTABLE_COLUMNS.has(id);
    const isCenter = CENTER_COLUMNS.has(id);
    const widthStyle = id === "title"
      ? (colW("title") ? { width: colW("title") } : undefined)
      : { width: colW(id) };

    if (!label) {
      return <th key={id} className="py-2 pr-2" style={widthStyle} />;
    }

    return (
      <th key={id} className={`group/th relative py-2 pr-3${isCenter ? " text-center" : ""}`} style={widthStyle}>
        {isSortable ? (
          <button type="button" onClick={() => handleColumnSort(id)} className={`flex items-center cursor-pointer hover:text-white/60${isCenter ? " justify-center w-full" : ""}`}>
            {label}<SortIndicator colId={id} sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
          </button>
        ) : label}
        {rh(id)}
      </th>
    );
  }, [col, colW, handleColumnSort, sortField, sortDir, onSortChange, rh]);

  const theadContent = (
    <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
      <tr className="group/thead border-b border-white/[0.06] text-left text-xs font-medium text-white/30">
        <th className="w-5 py-2 pl-1" />
        <th className="w-10 py-2 pl-1 pr-1">
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
        {effectiveOrder.map((id) => renderHeaderCell(id))}
      </tr>
    </thead>
  );

  const virtualizedTable = (
    <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
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
      <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
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
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-white/10" strokeWidth={1} />}
          title="No tickets in this sprint"
          description="Tickets will appear here once they are added to the sprint in Jira"
          className="py-16"
        />
      )}
    </div>
  );
}
