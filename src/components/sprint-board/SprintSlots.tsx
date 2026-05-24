"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Sprint } from "@/types/ticket";
import { ArrowUp, ArrowDown, ListFilter, RefreshCw, Layers, X, Plus, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SavedView, SortField, SortDir, ColumnId } from "./FilterBar";
import { ColumnToggle, SortDropdown, SORT_OPTIONS } from "./FilterBar";
import type { GroupByOption } from "./useGroupBy";
import { SprintSelector } from "./SprintSelector";
import { BarContainer } from "@/components/shared/BarContainer";
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
    <div ref={setNodeRef} style={style} className="relative flex h-full items-stretch">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`group relative flex items-center gap-1.5 px-2.5 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          isActive
            ? "text-text-primary"
            : "text-text-tertiary hover:text-text-secondary"
        }`}
        style={{ transition: "color 120ms" }}
        {...attributes}
        {...listeners}
      >
        {sprint.state === "backlog" ? (
          <Inbox className={`h-3 w-3 ${isActive ? "text-text-secondary" : "text-text-muted"}`} strokeWidth={1.5} />
        ) : sprint.state === "active" ? (
          <span
            className={`h-[7px] w-[7px] rounded-full ${isActive ? "bg-[var(--color-brand-400)]" : "bg-overlay-strong"}`}
            style={isActive ? { boxShadow: "0 0 5px color-mix(in srgb, var(--color-brand-400) 50%, transparent)" } : undefined}
          />
        ) : null}
        {sprint.name}
        {/* Active underline */}
        {isActive && (
          <span className="absolute bottom-0 left-1.5 right-1.5 h-[2px] rounded-full bg-[var(--color-brand-400)]" />
        )}
        {/* Hover underline preview */}
        {!isActive && (
          <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-0 group-hover:opacity-20" style={{ transition: "opacity 150ms" }} />
        )}
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
        className={isActive ? "" : "border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}
      />
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item ${
                opt.value === value ? "text-text-primary bg-overlay-subtle" : "text-text-secondary"
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

// -- Scroll overflow detection for fade indicators --

function useScrollOverflow(ref: React.RefObject<HTMLElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [ref, check]);

  return { canScrollLeft, canScrollRight };
}

export function SprintSlots({
  slotSprints,
  activeSlot,
  allActive,
  sprints,
  backlogCount = 0,
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
  activeFilterCount = 0,
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
  onCreateSprint,
}: {
  slotSprints: string[];
  activeSlot: number;
  allActive: boolean;
  sprints: Sprint[];
  backlogCount?: number;
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
  activeFilterCount?: number;
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
  onCreateSprint?: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight } = useScrollOverflow(scrollRef);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderSlots(String(active.id), String(over.id));
    }
  }

  return (
    <BarContainer>
      {/* Scrollable tab area with fade indicators */}
      <div className="relative flex min-w-0 flex-1 h-full items-stretch">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-r from-[var(--color-surface-base)] to-transparent" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-l from-[var(--color-surface-base)] to-transparent" />
        )}
      <div ref={scrollRef} className="flex min-w-0 flex-1 h-full items-stretch gap-1 xl:gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* All tab -- filled pill, no border, brand-tinted bg */}
      <button
        type="button"
        onClick={onAllClick}
        className={`group relative flex shrink-0 items-center self-center h-7 rounded-md px-2.5 text-xs font-semibold tracking-wide cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          allActive
            ? "text-[var(--color-brand-600)]"
            : "text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)]"
        }`}
        style={{
          transition: "color 120ms, background-color 150ms",
          backgroundColor: allActive
            ? "color-mix(in srgb, var(--color-brand-400) 18%, transparent)"
            : "color-mix(in srgb, var(--color-brand-400) 12%, transparent)",
        }}
        title="Show all tickets across sprints"
      >
        All
      </button>

      {/* Saved view tabs -- pill outline style to group with "All" */}
      {savedViews.length > 0 && savedViews.map((view) => {
        const isActive = activeViewId === view.id;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onViewClick?.(view)}
            className={`group relative flex shrink-0 items-center self-center h-7 rounded-md px-2.5 text-xs font-semibold tracking-wide cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "border-border-strong text-text-primary"
                : "border-border-default text-text-tertiary hover:text-text-secondary hover:border-border-strong"
            }`}
            style={{
              transition: "color 120ms, border-color 150ms",
              backgroundColor: isActive ? "color-mix(in srgb, var(--color-text-primary) 4%, transparent)" : undefined,
            }}
          >
            {view.title}
          </button>
        );
      })}

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
              <div key={sprintId} className="relative shrink-0 flex h-full items-stretch">
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
                    backlogCount={backlogCount}
                    onSelect={onSprintSelect}
                    onClose={onEditClose}
                  />
                )}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Create sprint button */}
      {onCreateSprint && (
        <button
          type="button"
          onClick={onCreateSprint}
          disabled={slotSprints.length >= 8}
          title={slotSprints.length >= 8 ? "Maximum 8 pinned sprints" : "Create sprint"}
          aria-label={slotSprints.length >= 8 ? "Maximum 8 pinned sprints" : "Create sprint"}
          className="group relative flex shrink-0 items-center justify-center self-center h-6 w-6 rounded-md text-text-muted cursor-pointer
            hover:text-text-secondary hover:bg-overlay-default
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted
            transition-colors duration-100"
        >
          <Plus size={13} strokeWidth={1.5} />
        </button>
      )}

      {/* Ephemeral (unpinned) sprint tab */}
      {ephemeralSprintId && (() => {
        const eSprint = sprints.find((s) => s.id === ephemeralSprintId);
        if (!eSprint) return null;
        return (
          <button
            type="button"
            onClick={onEphemeralClick}
            title="Temporary view -- not pinned"
            className={`group relative flex shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium cursor-pointer ${
              ephemeralIsActive
                ? "text-text-secondary"
                : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ transition: "color 120ms" }}
          >
            {eSprint.state === "active" && (
              <span className={`h-[7px] w-[7px] rounded-full ${ephemeralIsActive ? "bg-[var(--color-brand-400)]/60" : "bg-overlay-strong"}`} />
            )}
            <span className="italic">{eSprint.name}</span>
            {ephemeralIsActive && (
              <span className="absolute bottom-0 left-1.5 right-1.5 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-50" />
            )}
            {!ephemeralIsActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-0 group-hover:opacity-20" style={{ transition: "opacity 150ms" }} />
            )}
          </button>
        );
      })()}
      </div>{/* end scrollable inner */}
      </div>{/* end scroll wrapper */}

      {/* Right side: icon group */}
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        {/* Active sort label — shown to the left of the icon group */}
        {sortField && sortField !== "rank" && sortDir && onSortChange && (
          <div className="flex items-center mr-1">
            <button
              type="button"
              onClick={() => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1 rounded-l px-1.5 py-0.5 text-[11px] text-[var(--color-brand-400)] cursor-pointer hover:bg-overlay-subtle active:bg-overlay-default"
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
              onClick={() => onSortChange("rank", "asc")}
              className="flex items-center rounded-r px-0.5 py-0.5 text-[var(--color-brand-400)] cursor-pointer hover:bg-overlay-subtle active:bg-overlay-default hover:text-text-primary"
              title="Reset sort"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </div>
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

        {/* Toggle filter bar visibility */}
        {onToggleFilters && (
          <Button
            variant={filtersCollapsed && activeFilterCount > 0 ? "soft" : "ghost"}
            size="md"
            iconOnly
            onClick={onToggleFilters}
            title={filtersCollapsed ? "Show filters" : "Hide filters"}
            aria-label={filtersCollapsed ? "Show filters" : "Hide filters"}
            icon={
              <span className="relative flex items-center justify-center">
                <ListFilter className="h-3.5 w-3.5" strokeWidth={1.5} />
                {filtersCollapsed && activeFilterCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
                )}
              </span>
            }
            className={!filtersCollapsed || activeFilterCount > 0 ? "" : "border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}
          />
        )}
      </div>
    </BarContainer>
  );
}
