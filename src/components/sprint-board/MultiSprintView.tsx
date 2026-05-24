"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Ticket, Sprint, POStatus, TicketReadiness, JiraStatus, IssueType } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { SidePanel } from "./SidePanel";
import { GroupStatBar } from "./GroupStatBar";
import type { StatCriterion } from "./GroupStatBar";
import { SprintSelector } from "./SprintSelector";
import { SortableTicketRow } from "./TicketRow";
import { BulkActionBar } from "./BulkActionBar";
import { COLUMNS, ColumnToggle } from "./FilterBar";
import type { ColumnId } from "./FilterBar";
import { saveTicketMetadata, saveStoryPoints } from "./sprint-board-utils";
import { getJiraUrl } from "./TicketTableCells";
import { CalendarRange, RefreshCw, X, Columns2, ChevronDown, Search, Sheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTickets } from "@/hooks/useSprintBoard";
import { useTicketSessionMap, type TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { apiFetch, jira } from "@/lib/api-client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
  useDroppable,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
} from "@dnd-kit/sortable";

// Prefer the most specific droppable (ticket row) over the large column container.
// Ticket rows are checked first with pointerWithin; if the pointer is between rows or
// over an empty column, we fall back to the column container.
const compareCollisionDetection: CollisionDetection = (args) => {
  const ticketContainers = args.droppableContainers.filter(
    (c) => c.id !== "left" && c.id !== "right",
  );
  const ticketHits = pointerWithin({ ...args, droppableContainers: ticketContainers });
  if (ticketHits.length > 0) return ticketHits;
  const columnContainers = args.droppableContainers.filter(
    (c) => c.id === "left" || c.id === "right",
  );
  return pointerWithin({ ...args, droppableContainers: columnContainers });
};

// Header labels for all columns in compare view
const COMPARE_HEADER_LABELS: Record<ColumnId, string> = {
  type: "", key: "Key", title: "Title", epic: "Epic", sprint: "Sprint",
  jiraStatus: "Status", flagged: "", points: "SP", bv: "BV",
  notes: "", pipeline: "CI", assignee: "", poStatus: "Readiness",
  quality: "QS",
};

// Column widths for the compare view (pixels). Title takes remaining space.
const COMPARE_COL_WIDTHS: Record<ColumnId, number | undefined> = {
  type: 32, key: 120, title: undefined, epic: 130, sprint: 100,
  jiraStatus: 90, flagged: 36, points: 46, bv: 46,
  notes: 36, pipeline: 70, assignee: 36, poStatus: 70, quality: 56,
};

const COMPARE_LS_KEY = "bridge:compare-columns";
const COMPARE_SPLIT_LS_KEY = "bridge:compare-split";
const COMPARE_DEFAULT_VISIBLE: ColumnId[] = ["key", "title", "points", "assignee"];
const COMPARE_DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);
const COMPARE_MIN_COL_WIDTH = 28;

interface CompareColState {
  visible: ColumnId[];
  order: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
}

function loadCompareColumns(): CompareColState {
  try {
    const raw = localStorage.getItem(COMPARE_LS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { visible?: string[]; order?: string[]; widths?: Record<string, number> };
      const validIds = new Set<string>(COLUMNS.map((c) => c.id));
      const visible = (data.visible ?? COMPARE_DEFAULT_VISIBLE).filter((id) => validIds.has(id)) as ColumnId[];
      const savedOrder = (data.order ?? []).filter((id) => validIds.has(id)) as ColumnId[];
      const savedSet = new Set(savedOrder);
      const order = [...savedOrder, ...COMPARE_DEFAULT_ORDER.filter((id) => !savedSet.has(id))];
      const widths: Partial<Record<ColumnId, number>> = {};
      if (data.widths) {
        for (const [k, v] of Object.entries(data.widths)) {
          if (validIds.has(k) && typeof v === "number") widths[k as ColumnId] = v;
        }
      }
      return { visible, order, widths };
    }
  } catch { /* ignore */ }
  return { visible: COMPARE_DEFAULT_VISIBLE, order: COMPARE_DEFAULT_ORDER, widths: {} };
}

function saveCompareColumns(state: CompareColState) {
  try {
    localStorage.setItem(COMPARE_LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function loadSplitRatio(): number {
  try {
    const raw = localStorage.getItem(COMPARE_SPLIT_LS_KEY);
    if (raw) {
      const v = parseFloat(raw);
      if (v >= 0.2 && v <= 0.8) return v;
    }
  } catch { /* ignore */ }
  return 0.5;
}

function saveSplitRatio(ratio: number) {
  try {
    localStorage.setItem(COMPARE_SPLIT_LS_KEY, String(ratio));
  } catch { /* ignore */ }
}

// --- Column resize handle ---

function ColumnResizeHandle({
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

function PaneDivider({
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

function DroppableSprintColumn({
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

  const checkedInColumn = allTickets.filter((t) => checkedKeys.has(t.key));
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const selectedPoints = checkedInColumn.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

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
        <div className="pointer-events-none absolute left-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_left,rgba(46,145,73,0.06)_0%,transparent_70%)]" />

        {/* Sprint selector trigger */}
        <div className="relative flex shrink-0 items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-brand-500)]/15 ring-1 ring-[var(--color-brand-500)]/20">
            <CalendarRange size={11} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="flex items-center gap-1 cursor-pointer py-0.5 text-sm font-semibold tracking-tight text-text-primary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <span className="max-w-36 truncate">{currentSprint?.name ?? sprintId}</span>
              <ChevronDown size={11} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            </button>
            {selectorOpen && (
              <SprintSelector
                sprints={sprints}
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

        {/* Stat bar — dot-only status pills to stay compact */}
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
            className="h-6 w-28 rounded border border-border-default bg-overlay-subtle py-0.5 pl-5 pr-2 text-xs text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
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
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 36 }} />
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
                      className={`relative py-2 pr-2 text-xs font-medium text-text-muted select-none${isCenter ? " text-center" : ""}`}
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
                  <td colSpan={1 + activeOrder.length} className="py-12 text-center text-xs text-text-muted">
                    No matching tickets
                  </td>
                </tr>
              )}
              {isOver && filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={1 + activeOrder.length} className="py-6 text-center text-xs text-[var(--color-brand-400)]/50">
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

// --- Main MultiSprintView ---

export function MultiSprintView({
  initialLeft,
  initialRight,
  sprints,
  onClose,
  onSprintChange,
}: {
  initialLeft: string;
  initialRight: string;
  sprints: Sprint[];
  onClose: () => void;
  onSprintChange?: (side: "left" | "right", sprintId: string) => void;
}) {
  const [leftSprint, setLeftSprint] = useState(initialLeft);
  const [rightSprint, setRightSprint] = useState(initialRight);

  const { data: leftApiTickets, mutate: mutateLeft } = useTickets(leftSprint);
  const { data: rightApiTickets, mutate: mutateRight } = useTickets(rightSprint);
  const { ticketSessionMap } = useTicketSessionMap();

  // Local overrides keyed by sprintId so they auto-invalidate when the sprint changes
  const [leftOverride, setLeftOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);
  const [rightOverride, setRightOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);

  const leftTickets = useMemo(
    () => (leftOverride?.sprintId === leftSprint ? leftOverride.tickets : null) ?? leftApiTickets ?? [],
    [leftOverride, leftSprint, leftApiTickets],
  );
  const rightTickets = useMemo(
    () => (rightOverride?.sprintId === rightSprint ? rightOverride.tickets : null) ?? rightApiTickets ?? [],
    [rightOverride, rightSprint, rightApiTickets],
  );

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [leftSyncing, setLeftSyncing] = useState(false);
  const [rightSyncing, setRightSyncing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);
  const [readinessMap, setReadinessMap] = useState<Record<string, TicketReadiness | null>>({});

  // Column configuration (persisted in localStorage)
  const [compareColState, setCompareColState] = useState(() => loadCompareColumns());
  const compareVisible = useMemo(() => new Set(compareColState.visible), [compareColState.visible]);
  const compareOrder = compareColState.order;
  const compareWidths = compareColState.widths;

  const persistColState = useCallback((next: CompareColState) => {
    setCompareColState(next);
    saveCompareColumns(next);
  }, []);

  const handleCompareColumnToggle = useCallback((id: ColumnId, show: boolean) => {
    setCompareColState((prev) => {
      const next: CompareColState = show
        ? { ...prev, visible: [...prev.visible, id], order: prev.order.includes(id) ? prev.order : [...prev.order, id] }
        : { ...prev, visible: prev.visible.filter((c) => c !== id) };
      saveCompareColumns(next);
      return next;
    });
  }, []);

  const handleCompareColumnReorder = useCallback((activeId: ColumnId, overId: ColumnId) => {
    setCompareColState((prev) => {
      const oldIdx = prev.order.indexOf(activeId);
      const newIdx = prev.order.indexOf(overId);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = [...prev.order];
      next.splice(oldIdx, 1);
      next.splice(newIdx, 0, activeId);
      const result: CompareColState = { ...prev, order: next };
      saveCompareColumns(result);
      return result;
    });
  }, []);

  const handleCompareColumnReset = useCallback(() => {
    const result: CompareColState = { visible: COMPARE_DEFAULT_VISIBLE, order: COMPARE_DEFAULT_ORDER, widths: {} };
    persistColState(result);
  }, [persistColState]);

  const handleColumnResize = useCallback((id: ColumnId, width: number) => {
    setCompareColState((prev) => {
      const next: CompareColState = { ...prev, widths: { ...prev.widths, [id]: Math.round(width) } };
      saveCompareColumns(next);
      return next;
    });
  }, []);

  const handleColumnResizeReset = useCallback((id: ColumnId) => {
    setCompareColState((prev) => {
      const { [id]: _, ...rest } = prev.widths;
      const next: CompareColState = { ...prev, widths: rest };
      saveCompareColumns(next);
      return next;
    });
  }, []);

  // Pane split ratio
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio());
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const getMutateForKey = useCallback((key: string) => {
    return leftTickets.some((t) => t.key === key) ? mutateLeft : mutateRight;
  }, [leftTickets, mutateLeft, mutateRight]);

  const getListKeyForTicket = useCallback((key: string) => {
    const sprintId = leftTickets.some((t) => t.key === key) ? leftSprint : rightSprint;
    return `/api/tickets?sprintId=${encodeURIComponent(sprintId)}`;
  }, [leftTickets, leftSprint, rightSprint]);

  const handleTitleChange = useCallback(async (key: string, title: string) => {
    const inLeft = leftTickets.some((t) => t.key === key);
    const sourceTickets = inLeft ? leftTickets : rightTickets;
    const mutate = inLeft ? mutateLeft : mutateRight;
    const prev = sourceTickets.find((t) => t.key === key)?.title;
    mutate((data) => data?.map((t) => t.key === key ? { ...t, title } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/summary`, { method: "PUT", body: { title } });
    } catch {
      if (prev !== undefined) {
        mutate((data) => data?.map((t) => t.key === key ? { ...t, title: prev } : t), { revalidate: false });
      }
    }
  }, [leftTickets, rightTickets, mutateLeft, mutateRight]);

  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    saveTicketMetadata(key, { businessValue: value }, getListKeyForTicket(key));
  }, [getListKeyForTicket]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    saveStoryPoints(key, value, getListKeyForTicket(key));
  }, [getListKeyForTicket]);

  const handleReadinessChange = useCallback((key: string, readiness: TicketReadiness | null) => {
    const prev = readinessMap[key];
    setReadinessMap((m) => ({ ...m, [key]: readiness }));
    saveTicketMetadata(key, { readiness }, getListKeyForTicket(key)).then((ok) => {
      if (!ok) setReadinessMap((m) => ({ ...m, [key]: prev }));
    });
  }, [readinessMap, getListKeyForTicket]);

  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    const mutate = getMutateForKey(key);
    const allTickets = [...leftTickets, ...rightTickets];
    const prev = allTickets.find((t) => t.key === key)?.jiraStatus;
    mutate((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: status } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
    } catch {
      if (prev !== undefined) {
        mutate((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: prev } : t), { revalidate: false });
      }
    }
  }, [leftTickets, rightTickets, getMutateForKey]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    const mutate = getMutateForKey(key);
    const allTickets = [...leftTickets, ...rightTickets];
    const prev = allTickets.find((t) => t.key === key)?.type;
    mutate((data) => data?.map((t) => t.key === key ? { ...t, type } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
    } catch {
      if (prev !== undefined) {
        mutate((data) => data?.map((t) => t.key === key ? { ...t, type: prev } : t), { revalidate: false });
      }
    }
  }, [leftTickets, rightTickets, getMutateForKey]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const handleCopyToClipboard = useCallback(() => {
    const allTickets = [...leftTickets, ...rightTickets];
    const selected = allTickets.filter((t) => checkedKeys.has(t.key));
    const text = selected.map((t) => `- ${t.title} - ${getJiraUrl(t.key)}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${selected.length} ticket${selected.length === 1 ? "" : "s"} to clipboard`);
    }).catch(() => {
      showToast("Failed to copy to clipboard");
    });
  }, [leftTickets, rightTickets, checkedKeys, showToast]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    // Only track ticket keys; ignore container droppables ("left"/"right")
    setDragOverId(overId && overId !== "left" && overId !== "right" ? overId : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      setDragOverId(null);
      if (!over) return;

      const draggedKey = active.id as string;
      const sourceColumnId = active.data.current?.columnId as "left" | "right";
      const overId = String(over.id);

      // Determine target column: container droppable uses "left"/"right" id, ticket uses data.columnId
      const isContainerDrop = overId === "left" || overId === "right";
      const targetColumnId: "left" | "right" = isContainerDrop
        ? (overId as "left" | "right")
        : ((over.data.current?.columnId as "left" | "right") ??
            (leftTickets.some((t) => t.key === overId) ? "left" : "right"));
      const targetOverKey: string | null = isContainerDrop ? null : overId;

      const sourceTickets = sourceColumnId === "left" ? leftTickets : rightTickets;
      const targetTickets = targetColumnId === "left" ? leftTickets : rightTickets;

      if (sourceColumnId === targetColumnId) {
        // Within-column reorder — single ticket only
        if (!targetOverKey || targetOverKey === draggedKey) return;
        const draggedIdx = sourceTickets.findIndex((t) => t.key === draggedKey);
        const targetIdx = sourceTickets.findIndex((t) => t.key === targetOverKey);
        if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

        const reordered = arrayMove(sourceTickets, draggedIdx, targetIdx);

        const prevLeftOverride = leftOverride;
        const prevRightOverride = rightOverride;

        if (sourceColumnId === "left") {
          setLeftOverride({ sprintId: leftSprint, tickets: reordered });
        } else {
          setRightOverride({ sprintId: rightSprint, tickets: reordered });
        }

        const newDraggedIdx = reordered.findIndex((t) => t.key === draggedKey);
        const rankBeforeKey = reordered[newDraggedIdx + 1]?.key;
        const rankAfterKey = !rankBeforeKey ? reordered[newDraggedIdx - 1]?.key : undefined;

        try {
          await jira.rank({ issueKeys: [draggedKey], rankBeforeKey, rankAfterKey });
          // Update SWR cache with the reordered list without triggering a refetch.
          // An immediate refetch would race against Jira's processing and return the old order.
          if (sourceColumnId === "left") {
            await mutateLeft(reordered, { revalidate: false });
            setLeftOverride(null);
          } else {
            await mutateRight(reordered, { revalidate: false });
            setRightOverride(null);
          }
        } catch {
          setLeftOverride(prevLeftOverride);
          setRightOverride(prevRightOverride);
          showToast("Failed to reorder. Changes reverted.");
        }
        return;
      }

      // Cross-column move
      const keysToMove = checkedKeys.has(draggedKey)
        ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
        : [draggedKey];

      const ticketsToMove = keysToMove
        .map((k) => sourceTickets.find((t) => t.key === k))
        .filter((t): t is Ticket => t !== undefined);

      const newSource = sourceTickets.filter((t) => !keysToMove.includes(t.key));
      // Insert before the target ticket if dragged onto one, otherwise append
      let newTarget: Ticket[];
      if (targetOverKey) {
        const insertIdx = targetTickets.findIndex((t) => t.key === targetOverKey);
        newTarget = [
          ...targetTickets.slice(0, insertIdx),
          ...ticketsToMove,
          ...targetTickets.slice(insertIdx),
        ];
      } else {
        newTarget = [...targetTickets, ...ticketsToMove];
      }

      const prevLeftOverride = leftOverride;
      const prevRightOverride = rightOverride;

      if (sourceColumnId === "left") {
        setLeftOverride({ sprintId: leftSprint, tickets: newSource });
        setRightOverride({ sprintId: rightSprint, tickets: newTarget });
      } else {
        setRightOverride({ sprintId: rightSprint, tickets: newSource });
        setLeftOverride({ sprintId: leftSprint, tickets: newTarget });
      }

      setCheckedKeys((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      const targetSprintId = targetColumnId === "left" ? leftSprint : rightSprint;
      const targetName = sprints.find((s) => s.id === targetSprintId)?.name ?? "target sprint";

      try {
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
        if (targetOverKey) {
          // Rank is best-effort — don't let a rank failure revert a successful sprint move
          jira.rank({ issueKeys: keysToMove, rankBeforeKey: targetOverKey, sprintId: targetSprintId }).catch(() => {});
        }
        showToast(`Moved ${keysToMove.length} ticket${keysToMove.length === 1 ? "" : "s"} to ${targetName}`);
        // Update SWR caches with the optimistic state; skip refetch to avoid racing Jira.
        if (sourceColumnId === "left") {
          await mutateLeft(newSource, { revalidate: false });
          await mutateRight(newTarget, { revalidate: false });
        } else {
          await mutateRight(newSource, { revalidate: false });
          await mutateLeft(newTarget, { revalidate: false });
        }
        setLeftOverride(null);
        setRightOverride(null);
      } catch {
        setLeftOverride(prevLeftOverride);
        setRightOverride(prevRightOverride);
        showToast("Failed to move tickets. Changes reverted.");
      }
    },
    [checkedKeys, leftTickets, rightTickets, leftSprint, rightSprint, sprints, showToast, leftOverride, rightOverride, mutateLeft, mutateRight],
  );

  const selectedTicket = useMemo(
    () => (selectedKey ? [...leftTickets, ...rightTickets].find((t) => t.key === selectedKey) ?? null : null),
    [selectedKey, leftTickets, rightTickets],
  );

  const activeDragTicket = useMemo(
    () => (activeDragId ? [...leftTickets, ...rightTickets].find((t) => t.key === activeDragId) ?? null : null),
    [activeDragId, leftTickets, rightTickets],
  );

  const handlePoStatusChange = useCallback(
    (status: POStatus) => {
      if (!selectedKey) return;
      setPoStatuses((prev) => ({ ...prev, [selectedKey]: status }));
    },
    [selectedKey],
  );

  const handleRefreshLeft = useCallback(async () => {
    setLeftSyncing(true);
    try {
      await jira.syncTickets({ sprintId: leftSprint });
      setLeftOverride(null);
      await mutateLeft();
      showToast("Left sprint refreshed");
    } finally {
      setLeftSyncing(false);
    }
  }, [leftSprint, mutateLeft, showToast]);

  const handleRefreshRight = useCallback(async () => {
    setRightSyncing(true);
    try {
      await jira.syncTickets({ sprintId: rightSprint });
      setRightOverride(null);
      await mutateRight();
      showToast("Right sprint refreshed");
    } finally {
      setRightSyncing(false);
    }
  }, [rightSprint, mutateRight, showToast]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const leftAllChecked = leftTickets.length > 0 && leftTickets.every((t) => checkedKeys.has(t.key));
  const leftSomeChecked = leftTickets.some((t) => checkedKeys.has(t.key));
  const rightAllChecked = rightTickets.length > 0 && rightTickets.every((t) => checkedKeys.has(t.key));
  const rightSomeChecked = rightTickets.some((t) => checkedKeys.has(t.key));

  const toggleLeftAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (leftAllChecked) leftTickets.forEach((t) => next.delete(t.key));
      else leftTickets.forEach((t) => next.add(t.key));
      return next;
    });
  }, [leftAllChecked, leftTickets]);

  const toggleRightAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (rightAllChecked) rightTickets.forEach((t) => next.delete(t.key));
      else rightTickets.forEach((t) => next.add(t.key));
      return next;
    });
  }, [rightAllChecked, rightTickets]);

  const totalItems = leftTickets.length + rightTickets.length;
  const allBothChecked = leftAllChecked && rightAllChecked && totalItems > 0;
  const someBothChecked = leftSomeChecked || rightSomeChecked;

  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => {
      if (allBothChecked) return new Set();
      const next = new Set(prev);
      [...leftTickets, ...rightTickets].forEach((t) => next.add(t.key));
      return next;
    });
  }, [allBothChecked, leftTickets, rightTickets]);
  const totalChecked = checkedKeys.size;
  const totalSelectedPoints = [...leftTickets, ...rightTickets]
    .filter((t) => checkedKeys.has(t.key))
    .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <DndContext sensors={sensors} collisionDetection={compareCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="relative flex h-full flex-col">
        <ViewHeader
          icon={<Columns2 size={15} strokeWidth={1.5} className="text-text-tertiary" />}
          actions={
            <>
              <ColumnToggle
                visible={compareVisible}
                order={compareOrder}
                onChange={handleCompareColumnToggle}
                onReorder={handleCompareColumnReorder}
                onReset={handleCompareColumnReset}
              />
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
                onClick={onClose}
                title="Close compare view"
              />
            </>
          }
        >
          <ViewHeaderTitle>Compare Sprints</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-text-tertiary">{totalItems} items total</span>
        </ViewHeader>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div ref={splitContainerRef} className="flex min-w-0 flex-1 overflow-hidden">
            <DroppableSprintColumn
              columnId="left"
              sprintId={leftSprint}
              tickets={leftTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={leftSyncing}
              onRefresh={handleRefreshLeft}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              onToggleAll={toggleLeftAll}
              allChecked={leftAllChecked}
              someChecked={leftSomeChecked}
              sprints={sprints}
              onChangeSprint={(id) => {
                setLeftSprint(id);
                setLeftOverride(null);
                setSelectedKey(null);
                onSprintChange?.("left", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
              onTitleChange={handleTitleChange}
              editingTitleKey={editingTitleKey}
              onEditingTitleKeyChange={setEditingTitleKey}
              readinessMap={readinessMap}
              onReadinessChange={handleReadinessChange}
              onBusinessValueChange={handleBusinessValueChange}
              onStoryPointsChange={handleStoryPointsChange}
              onJiraStatusChange={handleJiraStatusChange}
              onIssueTypeChange={handleIssueTypeChange}
              visibleColumns={compareVisible}
              columnOrder={compareOrder}
              columnWidths={compareWidths}
              onColumnResize={handleColumnResize}
              onColumnResizeReset={handleColumnResizeReset}
              paneFlex={splitRatio}
              refinementSessionMap={ticketSessionMap}
            />
            <PaneDivider
              splitContainerRef={splitContainerRef}
              onRatioChange={(r) => { setSplitRatio(r); saveSplitRatio(r); }}
            />
            <DroppableSprintColumn
              columnId="right"
              sprintId={rightSprint}
              tickets={rightTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={rightSyncing}
              onRefresh={handleRefreshRight}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              onToggleAll={toggleRightAll}
              allChecked={rightAllChecked}
              someChecked={rightSomeChecked}
              sprints={sprints}
              onChangeSprint={(id) => {
                setRightSprint(id);
                setRightOverride(null);
                setSelectedKey(null);
                onSprintChange?.("right", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
              onTitleChange={handleTitleChange}
              editingTitleKey={editingTitleKey}
              onEditingTitleKeyChange={setEditingTitleKey}
              readinessMap={readinessMap}
              onReadinessChange={handleReadinessChange}
              onBusinessValueChange={handleBusinessValueChange}
              onStoryPointsChange={handleStoryPointsChange}
              onJiraStatusChange={handleJiraStatusChange}
              onIssueTypeChange={handleIssueTypeChange}
              visibleColumns={compareVisible}
              columnOrder={compareOrder}
              columnWidths={compareWidths}
              onColumnResize={handleColumnResize}
              onColumnResizeReset={handleColumnResizeReset}
              paneFlex={1 - splitRatio}
              refinementSessionMap={ticketSessionMap}
            />
          </div>

          {selectedTicket && (
            <div className="sticky top-0 min-h-full shrink-0 self-stretch overflow-y-auto border-l border-border-default">
              <SidePanel
                ticket={selectedTicket}
                poStatus={poStatuses[selectedTicket.key] ?? selectedTicket.poStatus}
                onPoStatusChange={handlePoStatusChange}
                onNotesChange={() => {}}
                onClose={() => setSelectedKey(null)}
                onShowToast={showToast}
              />
            </div>
          )}
        </div>

        {someBothChecked && (
          <BulkActionBar
            count={totalChecked}
            totalCount={totalItems}
            selectedPoints={totalSelectedPoints}
            allChecked={allBothChecked}
            onToggleAll={toggleAll}
            onClear={() => setCheckedKeys(new Set())}
            onCopyToClipboard={handleCopyToClipboard}
          />
        )}

        {toast && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] px-4 py-2 text-sm text-text-secondary shadow-[var(--shadow-md)]"
            style={{ zIndex: "var(--z-dropdown)" }}
          >
            {toast}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeDragTicket &&
          (() => {
            const isInLeft = leftTickets.some((t) => t.key === activeDragTicket.key);
            const sourceTickets = isInLeft ? leftTickets : rightTickets;
            const sameColumnChecked = checkedKeys.has(activeDragTicket.key)
              ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
              : [];
            const extraCount = sameColumnChecked.length > 1 ? sameColumnChecked.length - 1 : 0;
            return (
              <div
                className="rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-surface-elevated)] px-3 py-2 shadow-[var(--shadow-lg)]"
                style={{ opacity: 0.95 }}
              >
                <div className="flex items-center gap-2">
                  <IssueTypeIcon type={activeDragTicket.type} size={13} />
                  <span className="font-mono text-xs text-text-tertiary">{activeDragTicket.key}</span>
                  <span className="max-w-48 truncate text-xs text-text-secondary">{activeDragTicket.title}</span>
                  {extraCount > 0 && (
                    <span className="ml-1 rounded-full bg-[var(--color-brand-500)]/20 px-1.5 py-0.5 text-caption text-[var(--color-brand-400)]">
                      +{extraCount} more
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
      </DragOverlay>
    </DndContext>
  );
}
