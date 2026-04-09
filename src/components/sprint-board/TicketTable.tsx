"use client";

import { useState, useRef, useCallback } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import type { ColumnId, SortField, SortDir } from "@/components/sprint-board/FilterBar";
import { ColumnToggle } from "@/components/sprint-board/FilterBar";
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

export { POStatusCell, QualityBadge, POStatusIcon, EditStateDot, getJiraUrl };

const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT_ESTIMATE = 40;
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
  onColumnToggle,
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
  onColumnToggle?: (id: ColumnId, show: boolean) => void;
}) {
  const col = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);
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
  });

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
              QS<SortIndicator colId="quality" sortField={sortField} sortDir={sortDir} isSortable={!!onSortChange} />
            </button>
          </th>
        )}
        {col("notes") && <th className="w-8 py-2.5 pr-2" />}
        {onColumnToggle && (
          <th className="w-8 py-2.5 pr-5">
            <div className="flex justify-end">
              <ColumnToggle visible={visibleColumns} onChange={onColumnToggle} />
            </div>
          </th>
        )}
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
