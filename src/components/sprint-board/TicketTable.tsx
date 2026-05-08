"use client";

import { useState, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus } from "@/types/ticket";
import type { ColumnId, SortField, SortDir } from "@/components/sprint-board/FilterBar";
import { COLUMNS } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArrowUp, ArrowDown, ArrowUpDown, Sheet } from "lucide-react";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import type { TicketGroup, GroupByOption } from "@/components/sprint-board/useGroupBy";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
      <div className="absolute right-0 top-1 bottom-1 w-px bg-transparent group-hover/resize:bg-overlay-strong transition-colors duration-100" />
    </div>
  );
}

// Droppable zone rendered inside empty sprint groups during an active drag.
function DroppableGroupZone({ groupKey, totalColSpan }: { groupKey: string; totalColSpan: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-zone:${groupKey}`,
    data: { type: "group-zone", sprintId: groupKey },
  });
  return (
    <tr ref={setNodeRef}>
      <td colSpan={totalColSpan} className={`transition-colors duration-150 ${isOver ? "bg-[var(--color-brand-500)]/[0.04]" : ""}`}>
        <div className={`mx-3 my-2 flex h-8 items-center justify-center rounded border border-dashed text-xs transition-colors duration-150 ${
          isOver
            ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-300)]"
            : "border-border-default text-text-muted"
        }`}>
          Drop to move to this sprint
        </div>
      </td>
    </tr>
  );
}

const VIRTUALIZE_THRESHOLD = 80;
const ROW_HEIGHT_ESTIMATE = 32;
const VIRTUALIZER_OVERSCAN = 20;
// Below this width the table scrolls horizontally rather than continuing to compress columns.
// Chosen between 1024-1200px as a clean breakpoint for typical PO workstation widths.
const MIN_TABLE_WIDTH = 1100;

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
  poStatus: "readiness",
  quality: "quality",
  bv: "bv",
};

function defaultSortDir(field: SortField): SortDir {
  return field === "quality" || field === "bv" || field === "points" || field === "lastChanged" ? "desc" : "asc";
}

const HEADER_LABELS: Record<ColumnId, string> = {
  type: "", key: "Key", title: "Title", epic: "Epic",
  jiraStatus: "Status", sprint: "Sprint", points: "Pts", assignee: "",
  flagged: "", poStatus: "RDY", quality: "QS", bv: "BV", notes: "", pipeline: "",
};

const SORTABLE_COLUMNS: Set<ColumnId> = new Set(["key", "title", "epic", "jiraStatus", "points", "assignee", "poStatus", "quality", "bv"]);
const CENTER_COLUMNS: Set<ColumnId> = new Set(["points", "poStatus", "bv"]);

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
  readinessMap,
  inflightKeys,
  onToggleCheck,
  onRangeCheck,
  onToggleAll,
  onSelectTicket,
  onHoverRow,
  onLeaveRow,
  onPoStatusChange,
  onReadinessChange,
  onBusinessValueChange,
  onJiraStatusChange,
  onIssueTypeChange,
  onTitleChange,
  onCloseSubtasks,
  onTableKeyDown,
  onReorder,
  sortField,
  sortDir,
  onSortChange,
  columnOrder,
  columnWidths,
  onColumnResize,
  onColumnResetWidth,
  externalDnd,
  externalActiveDragId,
  dragOverKey,
  groups,
  collapsedGroups,
  onToggleCollapse,
  groupBy,
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
  readinessMap?: Record<string, TicketReadiness | null>;
  inflightKeys?: Set<string>;
  onToggleCheck: (key: string) => void;
  onRangeCheck: (keys: string[], checked: boolean) => void;
  onToggleAll: () => void;
  onSelectTicket: (key: string | null) => void;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onIssueTypeChange?: (key: string, type: IssueType) => void;
  onTitleChange?: (key: string, title: string) => void;
  onCloseSubtasks?: (key: string) => Promise<void>;
  onTableKeyDown: (e: React.KeyboardEvent) => void;
  onReorder?: (activeKey: string, overKey: string) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: SortField, dir: SortDir) => void;
  columnOrder?: ColumnId[];
  columnWidths?: Record<string, number>;
  onColumnResize?: (colId: string, width: number) => void;
  onColumnResetWidth?: (colId: string) => void;
  // When true, DndContext is owned by a parent component (SprintBoard).
  // The table only renders SortableContext; no internal DndContext or DragOverlay.
  externalDnd?: boolean;
  externalActiveDragId?: string | null;
  // Key of the ticket currently being hovered over during external drag (for insertion line).
  dragOverKey?: string | null;
  // Grouped rendering: when groups are provided, render per-group tbodies with headers.
  groups?: TicketGroup[];
  collapsedGroups?: Set<string>;
  onToggleCollapse?: (groupKey: string) => void;
  groupBy?: GroupByOption;
}) {
  const col = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);
  const DEFAULT_ORDER: ColumnId[] = useMemo(() => COLUMNS.map((c) => c.id), []);
  const effectiveOrder = columnOrder ?? DEFAULT_ORDER;
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const colW = useCallback((id: string): number | undefined => {
    return columnWidths?.[id] ?? (DEFAULT_COLUMN_WIDTHS[id] || undefined);
  }, [columnWidths]);

  // Compute left-pixel offsets for sticky columns (drag handle, checkbox, type, key, title).
  // Sticky columns let key/title remain visible during horizontal scroll.
  const stickyOffsets = useMemo<Record<string, number>>(() => {
    const CHECK_W = 40; // w-10
    const offsets: Record<string, number> = { _check: 0 };
    let offset = CHECK_W;
    for (const id of effectiveOrder) {
      if (!col(id)) continue;
      if (id === "type" || id === "key" || id === "title") {
        offsets[id] = offset;
      }
      if (id === "title") break;
      const w = colW(id) ?? DEFAULT_COLUMN_WIDTHS[id] ?? 0;
      offset += w;
    }
    return offsets;
  }, [effectiveOrder, col, colW]);

  // Total colspan for group header rows: checkbox + all visible content columns.
  const totalColSpan = useMemo(() => 1 + effectiveOrder.filter((id) => col(id)).length, [effectiveOrder, col]);

  const lastCheckRef = useRef<{ idx: number; checked: boolean } | null>(null);

  const [groupFilter, setGroupFilter] = useState<{ groupKey: string; criterion: "todo" | "in-progress" | "test" | "done" | "unpointed" } | null>(null);

  const [internalActiveDragId, setInternalActiveDragId] = useState<string | null>(null);
  const activeDragId = externalDnd ? externalActiveDragId ?? null : internalActiveDragId;
  const [reviewPopoverKey, setReviewPopoverKey] = useState<string | null>(null);
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);

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
    setInternalActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setInternalActiveDragId(null);
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
    readinessMap: readinessMap ?? {},
    selectedTicket,
    onHoverRow,
    onLeaveRow,
    onSelectTicket,
    onCheckboxClick: handleCheckboxClick,
    onPoStatusChange,
    onReadinessChange: onReadinessChange ?? (() => {}),
    onBusinessValueChange,
    onJiraStatusChange,
    onIssueTypeChange,
    onTitleChange,
    onCloseSubtasks,
    editingTitleKey,
    onEditingTitleKeyChange: setEditingTitleKey,
    reviewPopoverKey,
    onToggleReviewPopover: handleToggleReviewPopover,
    columnOrder: effectiveOrder,
    stickyOffsets,
  }), [checkedTickets, hoveredRow, selectedTicket, focusedTicketIdx, someChecked, activeDragId, col, sprintNameMap, poStatuses, readinessMap, inflightKeys, onHoverRow, onLeaveRow, onSelectTicket, handleCheckboxClick, onPoStatusChange, onReadinessChange, onBusinessValueChange, onJiraStatusChange, onIssueTypeChange, onTitleChange, onCloseSubtasks, editingTitleKey, reviewPopoverKey, handleToggleReviewPopover, effectiveOrder, stickyOffsets]);

  const rh = useMemo(() =>
    onColumnResize && onColumnResetWidth
      ? (id: string) => <ResizeHandle colId={id} onResize={onColumnResize} onReset={onColumnResetWidth} />
      : () => null,
  [onColumnResize, onColumnResetWidth]);

  const renderHeaderCell = useCallback((id: ColumnId) => {
    if (!col(id)) return null;

    const label = HEADER_LABELS[id];
    const isSortable = SORTABLE_COLUMNS.has(id);
    const isCenter = CENTER_COLUMNS.has(id);
    // Title is the flex filler when no width is pinned; explicit width when user has resized it.
    const titleW = colW("title");
    const widthStyle = id === "title" ? (titleW ? { width: titleW } : undefined) : { width: colW(id) };
    const stickyLeft = stickyOffsets[id];
    const isStickyCol = stickyLeft !== undefined;
    const fullStyle = isStickyCol
      ? { ...widthStyle, position: "sticky" as const, left: stickyLeft, zIndex: 12 }
      : widthStyle;
    const bgClass = isStickyCol ? " bg-[var(--color-surface-base)]" : "";

    if (!label) {
      return <th key={id} className={`overflow-hidden py-2 pr-2${bgClass}`} style={fullStyle} />;
    }

    return (
      <th key={id} className={`group/th relative overflow-hidden py-2 pr-3${isCenter ? " text-center" : ""}${bgClass}`} style={fullStyle}>
        {isSortable ? (
          <button type="button" onClick={() => handleColumnSort(id)} className={`flex items-center cursor-pointer hover:text-text-secondary${isCenter ? " justify-center w-full" : ""}`}>
            {label}<SortIndicator colId={id} sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
          </button>
        ) : label}
        {rh(id)}
      </th>
    );
  }, [col, colW, handleColumnSort, sortField, sortDir, onSortChange, rh, stickyOffsets]);

  const theadContent = (
    <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
      <tr className="group/thead h-[44px] border-b border-border-default text-left text-xs font-medium text-text-tertiary">
        <th className="w-10 py-2 pl-1 pr-1 bg-[var(--color-surface-base)]" style={{ position: "sticky", left: stickyOffsets._check, zIndex: 12 }} />
        {effectiveOrder.map((id) => renderHeaderCell(id))}
      </tr>
    </thead>
  );

  const virtualizedTable = (
    <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: MIN_TABLE_WIDTH }}>
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

  const activeInsertIdx = externalActiveDragId ? tickets.findIndex((t) => t.key === externalActiveDragId) : -1;
  const overInsertIdx = dragOverKey ? tickets.findIndex((t) => t.key === dragOverKey) : -1;

  // When externalDnd, rows must not shift during drag. undefined falls back to
  // dnd-kit's default rectSortingStrategy, which still moves items. A null-returning
  // function is the correct way to opt out of all position transforms.
  const sortableTableBody = (
    <SortableContext items={ticketIds} strategy={externalDnd ? () => null : verticalListSortingStrategy}>
      <tbody>
        {tickets.map((ticket, ticketIdx) => {
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          return (
            <SortableTicketRow
              key={ticket.key}
              {...makeRowProps(ticket, ticketIdx)}
              insertLine={insertLine}
            />
          );
        })}
      </tbody>
    </SortableContext>
  );

  // When externalDnd is true, DndContext + DragOverlay are owned by SprintBoard.
  // We only render SortableContext here so ticket rows register with the parent context.
  const dndTable = externalDnd ? (
    <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: MIN_TABLE_WIDTH }}>
      {theadContent}
      {sortableTableBody}
    </table>
  ) : (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: MIN_TABLE_WIDTH }}>
        {theadContent}
        {sortableTableBody}
      </table>
      <DragOverlay>
        {activeTicket && (
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg border border-border-strong">
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
                  <td className="py-2 pr-3 font-mono text-xs text-text-secondary">
                    {activeTicket.key}
                  </td>
                )}
                {col("title") && (
                  <td className="max-w-0 truncate py-2 pr-3 text-text-primary">
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

  // Grouped layout: one <tbody> per group with a header row and ticket rows.
  // Virtualization is disabled when groups are active since multiple tbodies are incompatible with virtual row indices.
  const isGrouped = groups && groups.length > 0;

  const groupedTable = isGrouped ? (
    <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: MIN_TABLE_WIDTH }}>
      {theadContent}
      {groups.map((group, groupIdx) => {
        const isCollapsed = collapsedGroups?.has(group.key) ?? false;

        const activeCriterion = groupFilter?.groupKey === group.key ? groupFilter.criterion : null;
        const visibleGroupTickets = activeCriterion === "todo"
          ? group.tickets.filter((t) => t.jiraStatus === "TO DO")
          : activeCriterion === "in-progress"
            ? group.tickets.filter((t) => t.jiraStatus === "IN PROGRESS")
            : activeCriterion === "test"
              ? group.tickets.filter((t) => t.jiraStatus === "TEST")
              : activeCriterion === "done"
                ? group.tickets.filter((t) => t.jiraStatus === "DONE")
                : activeCriterion === "unpointed"
                  ? group.tickets.filter((t) => !t.storyPoints)
                  : group.tickets;

        function toggleGroupFilter(criterion: "todo" | "in-progress" | "test" | "done" | "unpointed") {
          setGroupFilter((prev) =>
            prev?.groupKey === group.key && prev.criterion === criterion
              ? null
              : { groupKey: group.key, criterion },
          );
        }

        const groupTicketIds = visibleGroupTickets.map((t) => t.key);

        const ticketRows = !isCollapsed && visibleGroupTickets.map((ticket) => {
          const flatIdx = tickets.findIndex((t) => t.key === ticket.key);
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          return externalDnd ? (
            <SortableTicketRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
              insertLine={insertLine}
            />
          ) : (
            <TicketRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
            />
          );
        });

        const groupRows = externalDnd ? (
          <SortableContext items={groupTicketIds} strategy={() => null}>
            {ticketRows}
            {!isCollapsed && group.tickets.length === 0 && (
              <DroppableGroupZone groupKey={group.key} totalColSpan={totalColSpan} />
            )}
          </SortableContext>
        ) : ticketRows;

        return (
          <tbody key={group.key}>
            {/* Spacer row between groups (not before the first group) */}
            {groupIdx > 0 && (
              <tr>
                <td
                  colSpan={totalColSpan}
                  style={{ height: 8, padding: 0, border: "none" }}
                />
              </tr>
            )}
            {/* Group header row */}
            <tr
              className="border-b border-border-strong cursor-pointer select-none"
              style={{ background: "var(--color-overlay-subtle)" }}
              onClick={() => onToggleCollapse?.(group.key)}
            >
              <td colSpan={totalColSpan} className="py-2 pl-3 pr-4">
                <GroupStatBar
                  tickets={group.tickets}
                  label={group.label}
                  activeCriterion={activeCriterion}
                  onFilterChange={(criterion) => {
                    if (criterion === null) {
                      setGroupFilter(null);
                    } else {
                      toggleGroupFilter(criterion);
                    }
                  }}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => onToggleCollapse?.(group.key)}
                />
              </td>
            </tr>
            {groupRows}
          </tbody>
        );
      })}
    </table>
  ) : null;

  return (
    <div
      ref={tableContainerRef}
      className="flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={onTableKeyDown}
    >
      {isGrouped ? groupedTable : (enableVirtualization ? virtualizedTable : dndTable)}
      {tickets.length === 0 && !isGrouped && (
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-text-muted" strokeWidth={1} />}
          title="No tickets in this sprint"
          description="Tickets will appear here once they are added to the sprint in Jira"
          className="py-16"
        />
      )}
      {isGrouped && groups.every((g) => g.tickets.length === 0) && (
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-text-muted" strokeWidth={1} />}
          title="No tickets"
          description="Tickets will appear here once they are added in Jira"
          className="py-16"
        />
      )}
    </div>
  );
}
