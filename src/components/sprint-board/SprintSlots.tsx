"use client";

import { useState, useRef, useEffect } from "react";
import type { Sprint } from "@/types/ticket";
import { ArrowUp, ArrowDown, ChevronDown, ChevronUp, RefreshCw, LayoutGrid, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SavedView, SortField, SortDir, ColumnId } from "./FilterBar";
import { ColumnToggle, SortDropdown, SORT_OPTIONS } from "./FilterBar";
import type { GroupByOption } from "./useGroupBy";
import { SprintSelector } from "./SprintSelector";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// -- Sortable tab item --

function SortableTab({
  sprintId,
  sprint,
  isActive,
  onClick,
  onContextMenu,
}: {
  sprintId: string;
  sprint: Sprint;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sprintId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.7 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`relative flex items-center gap-2 px-3.5 py-3 text-sm font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          isActive
            ? "text-white/90 after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full"
            : "text-white/35 hover:text-white/60 active:text-white/50"
        }`}
        {...attributes}
        {...listeners}
      >
        {sprint.state === "active" && (
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-[var(--color-brand-400)]" : "bg-white/20"}`} />
        )}
        {sprint.name}
      </button>
    </div>
  );
}


// -- Group by dropdown (All view only) --

const GROUP_BY_OPTIONS: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sprint", label: "Sprint" },
  { value: "epic", label: "Epic" },
];

function GroupByDropdown({ value, onChange }: { value: GroupByOption; onChange: (v: GroupByOption) => void }) {
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

  const isActive = value !== "none";
  return (
    <div ref={ref} className="relative">
      <Button
        variant={isActive ? "soft" : "ghost"}
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={
          <span className="relative flex items-center justify-center">
            <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isActive && (
              <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
            )}
          </span>
        }
        title={isActive ? `Group by: ${value}` : "Group by"}
        aria-label={isActive ? `Group by: ${value}` : "Group by"}
        className={isActive ? "" : "border-0 bg-transparent text-white/40 hover:bg-hover-list-item hover:text-white/60"}
      />
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item ${
                opt.value === value ? "text-white bg-white/[0.03]" : "text-white/50"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${opt.value === value ? "bg-[var(--color-brand-400)]" : "opacity-0"}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SprintSlots({
  slotSprints,
  activeSlot,
  allActive,
  sprints,
  onSlotClick,
  onAllClick,
  editingSlot,
  onSlotEdit,
  onSprintSelect,
  onEditClose,
  syncing,
  onRefresh,
  onReorderSlots,
  ephemeralSprintId = null,
  ephemeralIsActive = false,
  onEphemeralClick,
  filtersCollapsed = false,
  onToggleFilters,
  savedViews = [],
  activeViewId = null,
  onViewClick,
  sortField,
  sortDir,
  onSortChange,
  columnVisible,
  columnOrder,
  onColumnToggle,
  onColumnReorder,
  onColumnReset,
  groupBy,
  onGroupByChange,
}: {
  slotSprints: string[];
  activeSlot: number;
  allActive: boolean;
  sprints: Sprint[];
  onSlotClick: (idx: number) => void;
  onAllClick: () => void;
  editingSlot: number | null;
  onSlotEdit: (idx: number) => void;
  onSprintSelect: (sprintId: string) => void;
  onEditClose: () => void;
  syncing: boolean;
  onRefresh: () => void;
  onReorderSlots: (activeId: string, overId: string) => void;
  ephemeralSprintId?: string | null;
  ephemeralIsActive?: boolean;
  onEphemeralClick?: () => void;
  filtersCollapsed?: boolean;
  onToggleFilters?: () => void;
  savedViews?: SavedView[];
  activeViewId?: string | null;
  onViewClick?: (view: SavedView) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: SortField, dir: SortDir) => void;
  columnVisible?: Set<ColumnId>;
  columnOrder?: ColumnId[];
  onColumnToggle?: (id: ColumnId, show: boolean) => void;
  onColumnReorder?: (activeId: ColumnId, overId: ColumnId) => void;
  onColumnReset?: () => void;
  groupBy?: GroupByOption;
  onGroupByChange?: (v: GroupByOption) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderSlots(String(active.id), String(over.id));
    }
  }

  return (
    <div className="flex h-[50px] items-stretch border-b border-border-default px-5">
      {/* Scrollable tab area */}
      <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* All tab -- always first, visually distinct with icon */}
      <button
        type="button"
        onClick={onAllClick}
        className={`relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-xs font-semibold tracking-wide cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          allActive
            ? "text-[var(--color-brand-400)] after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full"
            : "text-white/40 hover:text-white/65"
        }`}
        title="Show all tickets across sprints"
      >
        <LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        All
      </button>

      {/* Saved view tabs */}
      {savedViews.length > 0 && savedViews.map((view) => {
        const isActive = activeViewId === view.id;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onViewClick?.(view)}
            className={`relative flex shrink-0 items-center px-3 text-xs font-semibold tracking-wide cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "text-[var(--color-brand-400)] after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full"
                : "text-white/40 hover:text-white/65"
            }`}
          >
            {view.title}
          </button>
        );
      })}

      {/* Divider between All/saved views and sprint tabs */}
      <span className="mx-1 h-4 w-px bg-white/[0.07] self-center shrink-0" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slotSprints}
          strategy={horizontalListSortingStrategy}
        >
          {slotSprints.map((sprintId, idx) => {
            const sprint = sprints.find((s) => s.id === sprintId);
            if (!sprint) return null;
            const isActive = !activeViewId && idx === activeSlot;
            return (
              <div key={sprintId} className="relative shrink-0">
                <SortableTab
                  sprintId={sprintId}
                  sprint={sprint}
                  isActive={isActive}
                  onClick={() => onSlotClick(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSlotEdit(idx);
                  }}
                />
                {editingSlot === idx && (
                  <SprintSelector
                    sprints={sprints}
                    onSelect={onSprintSelect}
                    onClose={onEditClose}
                  />
                )}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Ephemeral (unpinned) sprint tab */}
      {ephemeralSprintId && (() => {
        const eSprint = sprints.find((s) => s.id === ephemeralSprintId);
        if (!eSprint) return null;
        return (
          <button
            type="button"
            onClick={onEphemeralClick}
            title="Temporary view -- not pinned"
            className={`relative flex shrink-0 items-center gap-2 px-3.5 py-3 text-sm font-medium cursor-pointer transition-colors duration-100 ${
              ephemeralIsActive
                ? "text-white/90 after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)]/60 after:rounded-full"
                : "text-white/30 hover:text-white/55"
            }`}
          >
            {eSprint.state === "active" && (
              <span className={`h-1.5 w-1.5 rounded-full ${ephemeralIsActive ? "bg-[var(--color-brand-400)]/60" : "bg-white/15"}`} />
            )}
            <span className="italic">{eSprint.name}</span>
          </button>
        );
      })()}
      </div>

      {/* Right side: active sort label + icon group */}
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        {/* Active sort label — shown to the left of the icon group */}
        {sortField && sortField !== "rank" && sortDir && onSortChange && (
          <span className="group/sort flex items-center gap-0.5 mr-1">
            <button
              type="button"
              onClick={() => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-brand-400)] cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06]"
              title={`Sorted: ${SORT_OPTIONS.find((o) => o.field === sortField)?.label} (${sortDir === "asc" ? "ascending" : "descending"}). Click to toggle.`}
            >
              <span>{SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? "Sort"}</span>
              {sortDir === "asc"
                ? <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                : <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
              }
            </button>
            <button
              type="button"
              onClick={() => onSortChange("rank" as SortField, "asc" as SortDir)}
              className="flex items-center justify-center rounded p-0.5 text-white/20 cursor-pointer opacity-0 group-hover/sort:opacity-100 hover:text-white/50 hover:bg-white/[0.04]"
              style={{ transition: "opacity 0.15s ease" }}
              title="Clear sort"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </span>
        )}

        {/* Group by -- only visible in the All view */}
        {allActive && groupBy !== undefined && onGroupByChange && (
          <GroupByDropdown value={groupBy} onChange={onGroupByChange} />
        )}

        {/* Column toggle */}
        {columnVisible && columnOrder && onColumnToggle && onColumnReorder && (
          <ColumnToggle
            visible={columnVisible}
            order={columnOrder}
            onChange={onColumnToggle}
            onReorder={onColumnReorder}
            onReset={onColumnReset}
          />
        )}

        {/* Sort */}
        {sortField && sortDir && onSortChange && (
          <SortDropdown
            field={sortField}
            direction={sortDir}
            onChange={onSortChange}
          />
        )}

        {/* Refresh board - hidden in All view since syncing all sprints at once is not practical */}
        {!allActive && (
          <Button
            variant="secondary"
            size="md"
            iconOnly
            disabled={syncing}
            onClick={onRefresh}
            title={syncing ? "Syncing..." : "Refresh board"}
            aria-label={syncing ? "Syncing..." : "Refresh board"}
            icon={
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
            }
          />
        )}

        {/* Toggle filter bar + analytics visibility */}
        {onToggleFilters && (
          <Button
            variant="ghost"
            size="md"
            iconOnly
            onClick={onToggleFilters}
            title={filtersCollapsed ? "Show filters" : "Hide filters"}
            aria-label={filtersCollapsed ? "Show filters" : "Hide filters"}
            icon={
              filtersCollapsed
                ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                : <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            }
          />
        )}
      </div>
    </div>
  );
}
