"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type { Ticket, Sprint, TicketReadiness, JiraStatus, IssueType } from "@/types/ticket";
import { EmptyState } from "@/components/shared/EmptyState";
import { GroupStatBar } from "./GroupStatBar";
import type { StatCriterion } from "./GroupStatBar";
import { SprintSelector } from "./SprintSelector";
import { SortableTicketRow } from "./TicketRow";
import type { ColumnId } from "./FilterBar";
import { CalendarRange, RefreshCw, X, ChevronDown, Search, Sheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import {
  COMPARE_HEADER_LABELS,
  COMPARE_COL_WIDTHS,
  COMPARE_MIN_COL_WIDTH,
} from "./multi-sprint-utils";
import { saveSplitRatio } from "./multi-sprint-utils";

// --- Column resize handle ---

export function ColumnResizeHandle({
  colId,
  onResize,
  onReset,
}: {
  colId: ColumnId;
  onResize: (id: ColumnId, width: number) => void;
  onReset: (id: ColumnId) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const th = (e.target as HTMLElement).closest("th");
      if (!th) return;
      const startX = e.clientX;
      const startWidth = th.offsetWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(COMPARE_MIN_COL_WIDTH, startWidth + ev.clientX - startX);
        onResize(colId, newWidth);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colId, onResize],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onReset(colId);
    },
    [colId, onReset],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="absolute right-0 top-0 z-10 h-full w-[5px] cursor-col-resize opacity-0 hover:opacity-100"
      style={{ background: "var(--color-brand-500)", opacity: undefined }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.3"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
    />
  );
}

// --- Pane divider (resizable left/right split) ---

export function PaneDivider({
  splitContainerRef,
  onRatioChange,
}: {
  splitContainerRef: React.RefObject<HTMLDivElement | null>;
  onRatioChange: (ratio: number) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;

      const onMouseMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const raw = (ev.clientX - rect.left) / rect.width;
        const clamped = Math.min(0.8, Math.max(0.2, raw));
        onRatioChange(clamped);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [splitContainerRef, onRatioChange],
  );

  const handleDoubleClick = useCallback(() => {
    onRatioChange(0.5);
    saveSplitRatio(0.5);
  }, [onRatioChange]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="group/divider relative z-30 w-px shrink-0 cursor-col-resize bg-overlay-default"
    >
      {/* Wider hit area */}
      <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
      {/* Visual indicator on hover */}
      <div className="absolute inset-y-0 left-0 w-px bg-[var(--color-brand-500)] opacity-0 group-hover/divider:opacity-40" style={{ transition: "opacity 120ms" }} />
    </div>
  );
}

// --- Droppable sprint column ---

export function DroppableSprintColumn({
  columnId,
  sprintId,
  tickets: allTickets,
  checkedKeys,
  selectedKey,
  syncing,
  onRefresh,
  onToggleCheck,
  onSelect,
  onToggleAll,
  allChecked,
  someChecked,
  sprints,
  backlogCount = 0,
  onChangeSprint,
  activeDragId,
  dragOverId,
  onTitleChange,
  editingTitleKey,
  onEditingTitleKeyChange,
  readinessMap,
  onReadinessChange,
  onBusinessValueChange,
  onStoryPointsChange,
  onJiraStatusChange,
  onIssueTypeChange,
  visibleColumns,
  columnOrder,
  columnWidths,
  onColumnResize,
  onColumnResizeReset,
  paneFlex,
  refinementSessionMap,
}: {
  columnId: "left" | "right";
  sprintId: string;
  tickets: Ticket[];
  checkedKeys: Set<string>;
  selectedKey: string | null;
  syncing: boolean;
  onRefresh: () => void;
  onToggleCheck: (key: string) => void;
  onSelect: (key: string | null) => void;
  onToggleAll: () => void;
  allChecked: boolean;
  someChecked: boolean;
  sprints: Sprint[];
  backlogCount?: number;
  onChangeSprint: (id: string) => void;
  activeDragId: string | null;
  dragOverId: string | null;
  onTitleChange: (key: string, title: string) => void;
  editingTitleKey: string | null;
  onEditingTitleKeyChange: (key: string | null) => void;
  readinessMap: Record<string, TicketReadiness | null>;
  onReadinessChange: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  onJiraStatusChange: (key: string, status: JiraStatus) => void;
  onIssueTypeChange: (key: string, type: IssueType) => void;
  visibleColumns: Set<ColumnId>;
  columnOrder: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  onColumnResize: (id: ColumnId, width: number) => void;
  onColumnResizeReset: (id: ColumnId) => void;
  paneFlex?: number;
  refinementSessionMap?: Map<string, TicketSessionEntry[]>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const lastCheckRef = useRef<{ idx: number; checked: boolean } | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCriterion, setActiveCriterion] = useState<StatCriterion | null>(null);

  const currentSprint = sprints.find((s) => s.id === sprintId);

  // Only show visible columns in their configured order
  const activeOrder = useMemo(
    () => columnOrder.filter((id) => visibleColumns.has(id)),
    [columnOrder, visibleColumns],
  );
  const colVisible = useCallback((id: ColumnId) => visibleColumns.has(id), [visibleColumns]);

  const filteredTickets = useMemo(() => {
    let result = allTickets;

    if (activeCriterion) {
      result = result.filter((t) => {
        if (activeCriterion === "todo") return t.jiraStatus === "TO DO";
        if (activeCriterion === "in-progress") return t.jiraStatus === "IN PROGRESS";
        if (activeCriterion === "test") return t.jiraStatus === "TEST";
        if (activeCriterion === "done") return t.jiraStatus === "DONE";
        if (activeCriterion === "unpointed") return t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike";
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.key.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.assignee?.name?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [allTickets, activeCriterion, searchQuery]);

  const isFiltered = activeCriterion !== null || searchQuery.trim() !== "";

  // Insertion line indices (based on allTickets for stable cross-filter positioning)
  const activeInsertIdx = activeDragId ? allTickets.findIndex((t) => t.key === activeDragId) : -1;
  const overInsertIdx = dragOverId ? allTickets.findIndex((t) => t.key === dragOverId) : -1;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col overflow-hidden ${
        isOver ? "ring-1 ring-inset ring-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/[0.015]" : ""
      }`}
      style={{ transition: "background-color 0.15s ease", flex: paneFlex ?? 1 }}
    >
      {/* Column header - z-20 beats the sticky thead's z-10, keeping dropdown on top */}
      <div className="relative z-20 flex h-[44px] shrink-0 items-center gap-2 border-b border-border-default bg-[var(--color-surface-elevated)] px-3">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_left,color-mix(in_srgb,var(--color-brand-600)_6%,transparent)_0%,transparent_70%)]" />

        {/* Sprint selector trigger */}
        <div className="relative flex shrink-0 items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-brand-500)]/15 ring-1 ring-[var(--color-brand-500)]/20">
            <CalendarRange size={11} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="flex items-center gap-1 cursor-pointer py-0.5 text-body-lg font-semibold tracking-tight text-text-primary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <span className="max-w-36 truncate">{currentSprint?.name ?? sprintId}</span>
              <ChevronDown size={11} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            </button>
            {selectorOpen && (
              <SprintSelector
                sprints={sprints}
                backlogCount={backlogCount}
                onSelect={(id) => {
                  onChangeSprint(id);
                  setSelectorOpen(false);
                }}
                onClose={() => setSelectorOpen(false)}
              />
            )}
          </div>
        </div>

        <div className="h-3 w-px shrink-0 bg-overlay-strong" />

        {/* Stat bar */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <GroupStatBar
            tickets={allTickets}
            activeCriterion={activeCriterion}
            onFilterChange={setActiveCriterion}
            showDot
          />
        </div>

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-6 w-28 rounded border border-border-default bg-overlay-subtle py-0.5 pl-5 pr-2 text-body-sm text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted cursor-pointer hover:text-text-secondary"
            >
              <X className="h-2.5 w-2.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<RefreshCw size={12} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />}
          onClick={onRefresh}
          disabled={syncing}
          title="Refresh from Jira"
          aria-label="Refresh from Jira"
          className="shrink-0"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {allTickets.length === 0 ? (
          <EmptyState
            icon={<Sheet className="h-5 w-5 text-text-muted" strokeWidth={1} />}
            title="No tickets in this sprint"
            description="Select a different sprint or add tickets in Jira"
            className="py-16"
          />
        ) : (
          <table className="w-full table-fixed border-collapse text-body-lg">
            <colgroup>
              {/* Checkbox gutter: a small breathing gap by default; widens into a real gutter in bulk mode. */}
              <col style={{ width: someChecked ? 36 : 12 }} />
              {activeOrder.map((colId) => {
                const w = columnWidths[colId] ?? COMPARE_COL_WIDTHS[colId];
                return <col key={colId} style={w ? { width: w } : undefined} />;
              })}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
              <tr className="h-[44px] border-b border-border-subtle text-left">
                <th className="w-9 py-2 pl-1 pr-1" />
                {activeOrder.map((colId) => {
                  const label = COMPARE_HEADER_LABELS[colId] ?? "";
                  const isCenter = colId === "points" || colId === "bv";
                  return (
                    <th
                      key={colId}
                      className={`relative py-2 pr-2 text-body-sm font-medium text-text-muted select-none${isCenter ? " text-center" : ""}`}
                    >
                      {label || "\u00A0"}
                      <ColumnResizeHandle
                        colId={colId}
                        onResize={onColumnResize}
                        onReset={onColumnResizeReset}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <SortableContext items={filteredTickets.map((t) => t.key)} strategy={() => null}>
            <tbody>
              {filteredTickets.map((ticket, idx) => {
                let insertLine: "above" | "below" | undefined;
                if (dragOverId && ticket.key === dragOverId && overInsertIdx !== -1) {
                  insertLine = activeInsertIdx !== -1
                    ? (activeInsertIdx > overInsertIdx ? "above" : "below")
                    : "above";
                }
                return (
                  <SortableTicketRow
                    key={ticket.key}
                    ticket={ticket}
                    ticketIdx={idx}
                    col={colVisible}
                    columnOrder={activeOrder}
                    isChecked={checkedKeys.has(ticket.key)}
                    isSelected={selectedKey === ticket.key}
                    someChecked={someChecked}
                    isDragActive={activeDragId !== null}
                    selectedTicket={selectedKey}
                    onSelectTicket={onSelect}
                    onCheckboxClick={(key, clickIdx, shiftKey) => {
                      const anchor = lastCheckRef.current;
                      if (shiftKey && anchor !== null) {
                        const from = Math.min(anchor.idx, clickIdx);
                        const to = Math.max(anchor.idx, clickIdx);
                        const rangeKeys = filteredTickets.slice(from, to + 1).map((t) => t.key);
                        rangeKeys.forEach((k) => {
                          if (anchor.checked) { if (!checkedKeys.has(k)) onToggleCheck(k); }
                          else { if (checkedKeys.has(k)) onToggleCheck(k); }
                        });
                      } else {
                        const willBeChecked = !checkedKeys.has(key);
                        lastCheckRef.current = { idx: clickIdx, checked: willBeChecked };
                        onToggleCheck(key);
                      }
                    }}
                    onTitleChange={onTitleChange}
                    editingTitleKey={editingTitleKey}
                    onEditingTitleKeyChange={onEditingTitleKeyChange}
                    readinessMap={readinessMap}
                    onReadinessChange={onReadinessChange}
                    onBusinessValueChange={onBusinessValueChange}
                    onStoryPointsChange={onStoryPointsChange}
                    onJiraStatusChange={onJiraStatusChange}
                    onIssueTypeChange={onIssueTypeChange}
                    insertLine={insertLine}
                    sortableData={{ columnId }}
                    refinementSessions={refinementSessionMap?.get(ticket.key)}
                  />
                );
              })}
              {filteredTickets.length === 0 && isFiltered && (
                <tr>
                  <td colSpan={1 + activeOrder.length} className="py-12 text-center text-body-sm text-text-muted">
                    No matching tickets
                  </td>
                </tr>
              )}
              {isOver && filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={1 + activeOrder.length} className="py-6 text-center text-body-sm text-[var(--color-brand-400)]/50">
                    Drop here to move
                  </td>
                </tr>
              )}
            </tbody>
            </SortableContext>
          </table>
        )}
      </div>
    </div>
  );
}
