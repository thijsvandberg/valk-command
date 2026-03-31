"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Ticket, POStatus } from "./mock-data";
import { EPIC_COLORS, PO_STATUS_OPTIONS } from "./mock-data";
import { PO_STATUS_COLORS, type ColumnId } from "./FilterBar";
import { IssueTypeIcon } from "../shared/IssueTypeIcon";
import { Avatar } from "../shared/Avatar";
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

// Build external Jira URL for a given ticket key
function getJiraUrl(ticketKey: string): string {
  const base =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_JIRA_BASE_URL) ||
    "https://new-story.atlassian.net";
  return `${base.replace(/\/$/, "")}/browse/${ticketKey}`;
}

export { getJiraUrl };

// -- JIRA status colors (inline for table rendering) --

const JIRA_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(46, 145, 73, 0.15)", text: "#4aaa60" },
  TEST: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
  DONE: { bg: "rgba(46, 145, 73, 0.25)", text: "#2e9149" },
};

// -- Quality score badge --

function QualityBadge({ score, stale }: { score: number | null; stale: boolean }) {
  if (score === null) return <span className="text-white/15">--</span>;

  let color: string;
  if (score < 30) color = "#e5534b";
  else if (score < 70) color = "#ea8744";
  else color = "#4aaa60";

  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      style={{ color, opacity: stale ? 0.4 : 1 }}
      title={stale ? "Score is based on an older version of this story" : `Quality: ${score}/100`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {score}
      {stale && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white/30">
          <path d="M6 1v4l2.5 1.5M11 6a5 5 0 11-10 0 5 5 0 0110 0z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

export { QualityBadge };

// -- PO Status icon per status --

function POStatusIcon({ status, size = 14 }: { status: POStatus; size?: number }) {
  if (!status) {
    return (
      <svg viewBox="0 0 16 16" style={{ width: size, height: size }}>
        <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
      </svg>
    );
  }

  switch (status) {
    case "Nieuw":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: size, height: size }}>
          <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z" />
        </svg>
      );
    case "Uitwerken":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
          <path d="M11.5 2.5l2 2-8 8H3.5v-2z" />
          <path d="M9.5 4.5l2 2" />
        </svg>
      );
    case "Wachten op feedback":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" style={{ width: size, height: size }}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5v3.5l2.5 1.5" />
        </svg>
      );
    case "Klaar voor refinement":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" style={{ width: size, height: size }}>
          <circle cx="8" cy="8" r="5.5" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      );
    case "Ready":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
          <path d="M3.5 8.5l3 3 6-6" />
        </svg>
      );
    case "Geparkeerd":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: size, height: size }}>
          <rect x="4" y="3.5" width="3" height="9" rx="0.75" />
          <rect x="9" y="3.5" width="3" height="9" rx="0.75" />
        </svg>
      );
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
  return (
    <td
      className="w-5 py-2 pl-1 pr-0 opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      <svg viewBox="0 0 8 14" className="h-3.5 w-2 text-white/25 hover:text-white/50">
        <circle cx="2" cy="2" r="1" fill="currentColor" />
        <circle cx="6" cy="2" r="1" fill="currentColor" />
        <circle cx="2" cy="7" r="1" fill="currentColor" />
        <circle cx="6" cy="7" r="1" fill="currentColor" />
        <circle cx="2" cy="12" r="1" fill="currentColor" />
        <circle cx="6" cy="12" r="1" fill="currentColor" />
      </svg>
    </td>
  );
}

// -- Sortable row wrapper --

function SortableTicketRow({
  ticket,
  ticketIdx,
  isChecked,
  isHovered,
  isSelected,
  isFocused,
  someChecked,
  isDragActive,
  col,
  poStatuses,
  selectedTicket,
  onHoverRow,
  onLeaveRow,
  onSelectTicket,
  onToggleCheck,
  onPoStatusChange,
}: {
  ticket: Ticket;
  ticketIdx: number;
  isChecked: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isFocused: boolean;
  someChecked: boolean;
  isDragActive: boolean;
  col: (id: ColumnId) => boolean;
  poStatuses: Record<string, POStatus>;
  selectedTicket: string | null;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onSelectTicket: (key: string | null) => void;
  onToggleCheck: (key: string) => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    ...(ticket.flagged ? { boxShadow: "inset 4px 0 0 #e5534b" } : {}),
    ...(isDragging ? { opacity: 0.4, zIndex: 10 } : {}),
  };

  const showCheckbox = isChecked || isHovered || someChecked;
  const epicColor = ticket.epic ? EPIC_COLORS[ticket.epic] : null;
  const jiraColor = JIRA_STATUS_COLORS[ticket.jiraStatus];

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => onHoverRow(ticket.key)}
      onMouseLeave={onLeaveRow}
      onClick={(e) => {
        if (isDragActive) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(getJiraUrl(ticket.key), "_blank", "noopener,noreferrer");
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
      {/* Drag handle */}
      <DragHandle listeners={listeners} attributes={attributes} />

      {/* Checkbox */}
      <td
        className="cursor-pointer select-none py-2 pl-1 pr-1"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(ticket.key);
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
          {ticket.key}
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
          {ticket.flagged && (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#e5534b]" fill="currentColor">
              <path d="M3 2v12m0-12l8 3.5L3 9" />
            </svg>
          )}
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
        <td className="py-2 pr-3 text-xs tabular-nums">
          <QualityBadge score={ticket.qualityScore} stale={ticket.qualityStale} />
        </td>
      )}

      {col("notes") && (
        <td className="py-2 pr-5">
          {ticket.notes && (
            <span title={ticket.notes}>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white/20">
                <path d="M3 3h10v8H7l-3 2v-2H3V3z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </td>
      )}
    </tr>
  );
}

// -- Ticket table --

export function TicketTable({
  tickets,
  checkedTickets,
  selectedTicket,
  hoveredRow,
  focusedTicketIdx,
  someChecked,
  allChecked,
  visibleColumns,
  poStatuses,
  onToggleCheck,
  onToggleAll,
  onSelectTicket,
  onHoverRow,
  onLeaveRow,
  onPoStatusChange,
  onTableKeyDown,
  onReorder,
}: {
  tickets: Ticket[];
  checkedTickets: Set<string>;
  selectedTicket: string | null;
  hoveredRow: string | null;
  focusedTicketIdx: number;
  someChecked: boolean;
  allChecked: boolean;
  visibleColumns: Set<ColumnId>;
  poStatuses: Record<string, POStatus>;
  onToggleCheck: (key: string) => void;
  onToggleAll: () => void;
  onSelectTicket: (key: string | null) => void;
  onHoverRow: (key: string | null) => void;
  onLeaveRow: () => void;
  onPoStatusChange: (key: string, status: POStatus) => void;
  onTableKeyDown: (e: React.KeyboardEvent) => void;
  onReorder?: (activeKey: string, overKey: string) => void;
}) {
  const col = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

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

  const ticketIds = tickets.map((t) => t.key);
  const activeTicket = activeDragId ? tickets.find((t) => t.key === activeDragId) : null;

  return (
    <div
      ref={tableContainerRef}
      className="flex-1 overflow-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={onTableKeyDown}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
            <tr className="border-b border-white/[0.06] text-left text-xs font-medium text-white/30">
              <th className="w-5 py-2.5 pl-1" />
              <th className="w-10 py-2.5 pl-1 pr-1">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)] cursor-pointer"
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                />
              </th>
              {col("type") && <th className="w-8 py-2.5 pr-2" />}
              {col("key") && <th className="w-24 py-2.5 pr-3">Key</th>}
              {col("title") && <th className="py-2.5 pr-3">Title</th>}
              {col("epic") && <th className="w-36 py-2.5 pr-3">Epic</th>}
              {col("jiraStatus") && <th className="w-28 py-2.5 pr-3">Status</th>}
              {col("points") && <th className="w-12 py-2.5 pr-3 text-center">Pts</th>}
              {col("assignee") && <th className="w-10 py-2.5 pr-3" />}
              {col("flagged") && <th className="w-8 py-2.5 pr-2" />}
              {col("poStatus") && <th className="w-10 py-2.5 pr-2 text-center">PO</th>}
              {col("quality") && <th className="w-16 py-2.5 pr-3">Quality</th>}
              {col("notes") && <th className="w-8 py-2.5 pr-5" />}
            </tr>
          </thead>
          <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
            <tbody>
              {tickets.map((ticket, ticketIdx) => (
                <SortableTicketRow
                  key={ticket.key}
                  ticket={ticket}
                  ticketIdx={ticketIdx}
                  isChecked={checkedTickets.has(ticket.key)}
                  isHovered={hoveredRow === ticket.key}
                  isSelected={selectedTicket === ticket.key}
                  isFocused={focusedTicketIdx === ticketIdx}
                  someChecked={someChecked}
                  isDragActive={activeDragId !== null}
                  col={col}
                  poStatuses={poStatuses}
                  selectedTicket={selectedTicket}
                  onHoverRow={onHoverRow}
                  onLeaveRow={onLeaveRow}
                  onSelectTicket={onSelectTicket}
                  onToggleCheck={onToggleCheck}
                  onPoStatusChange={onPoStatusChange}
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
      {tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg viewBox="0 0 48 48" className="mb-4 h-12 w-12 text-white/10">
            <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M6 18h36M18 18v20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-white/30">No tickets in this sprint</p>
          <p className="mt-1 text-xs text-white/15">Tickets will appear here once they are added to the sprint in Jira</p>
        </div>
      )}
    </div>
  );
}
