"use client";

import { useState, useRef, useEffect } from "react";
import type { Sprint } from "@/types/ticket";
import { SprintListModal } from "./SprintListModal";
import { ChevronRight, ChevronDown, ChevronUp, List, RefreshCw, LayoutGrid } from "lucide-react";
import type { SavedView } from "./FilterBar";
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

// -- Sprint slot selector dropdown --

function SprintSelector({
  sprints,
  onSelect,
  onClose,
}: {
  sprints: Sprint[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const activeFuture = sprints.filter((s) => s.state !== "closed");
  const closed = sprints.filter((s) => s.state === "closed");
  const filtered = (list: Sprint[]) =>
    search ? list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : list;

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-1 pb-1">
        {filtered(activeFuture).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onSelect(s.id);
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/70 cursor-pointer hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.state === "active" ? "#4aaa60" : "#60a5fa" }}
              />
              {s.name}
            </span>
            <span className="text-xs text-white/25">{s.dateRange || `${s.ticketCount} items`}</span>
          </button>
        ))}

        {closed.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowClosed(!showClosed)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-white/30 cursor-pointer hover:text-white/50"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform duration-150 ${showClosed ? "rotate-90" : ""}`}
                strokeWidth={1.5}
              />
              Closed sprints ({closed.length})
            </button>
            {showClosed &&
              filtered(closed).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    {s.name}
                  </span>
                  <span className="text-xs text-white/20">{s.dateRange}</span>
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function SprintListButton({
  onSelect,
  onPin,
  pinnedIds,
}: {
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
      >
        <List className="h-3.5 w-3.5" strokeWidth={1.5} />
        Sprints
      </button>
      {open && (
        <SprintListModal
          onClose={() => setOpen(false)}
          onSelect={onSelect}
          onPin={onPin}
          pinnedIds={pinnedIds}
        />
      )}
    </>
  );
}

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
  onSprintListSelect,
  onAddSlotWithSprint,
  onReorderSlots,
  ephemeralSprintId = null,
  ephemeralIsActive = false,
  onEphemeralClick,
  filtersCollapsed = false,
  onToggleFilters,
  savedViews = [],
  activeViewId = null,
  onViewClick,
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
  onSprintListSelect: (sprintId: string) => void;
  onAddSlotWithSprint: (sprintId: string) => void;
  onReorderSlots: (activeId: string, overId: string) => void;
  ephemeralSprintId?: string | null;
  ephemeralIsActive?: boolean;
  onEphemeralClick?: () => void;
  filtersCollapsed?: boolean;
  onToggleFilters?: () => void;
  savedViews?: SavedView[];
  activeViewId?: string | null;
  onViewClick?: (view: SavedView) => void;
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
    <div className="flex h-[50px] items-stretch gap-1 border-b border-white/[0.06] px-5">
      {/* All tab — always first, visually distinct with icon */}
      <button
        type="button"
        onClick={onAllClick}
        className={`relative flex items-center gap-1.5 px-3 py-3 text-xs font-semibold tracking-wide cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
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
            className={`relative flex items-center px-3 text-xs font-semibold tracking-wide cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
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
              <div key={sprintId} className="relative">
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
            title="Temporary view — not pinned"
            className={`relative flex items-center gap-2 px-3.5 py-3 text-sm font-medium cursor-pointer transition-colors duration-100 ${
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

      {/* Right side: sprint list + refresh */}
      <div className="ml-auto flex items-center gap-2">
        {/* Sprint list button */}
        <div className="relative">
          <SprintListButton
            onSelect={(id) => onSprintListSelect(id)}
            onPin={(id) => onAddSlotWithSprint(id)}
            pinnedIds={new Set(slotSprints)}
          />
        </div>

        {/* Refresh board - hidden in All view since syncing all sprints at once is not practical */}
        {!allActive && (
          <button
            type="button"
            disabled={syncing}
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {syncing ? "Syncing..." : "Refresh"}
          </button>
        )}

        {/* Toggle filter bar + analytics visibility */}
        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            title={filtersCollapsed ? "Show filters" : "Hide filters"}
            className="flex items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5 text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          >
            {filtersCollapsed
              ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
              : <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            }
          </button>
        )}
      </div>
    </div>
  );
}
