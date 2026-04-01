"use client";

import { useState, useRef, useEffect } from "react";
import type { Sprint } from "@/types/ticket";
import { SprintListModal } from "./SprintListModal";
import { ChevronRight, List, Plus, RefreshCw } from "lucide-react";
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
        className={`relative flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          isActive
            ? "bg-[var(--color-surface-base)] text-white border border-white/[0.08] border-b-transparent -mb-px after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[var(--color-brand-400)] after:rounded-full"
            : "text-white/35 hover:text-white/55 hover:bg-white/[0.02] active:bg-white/[0.04]"
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
  sprints,
  onSlotClick,
  editingSlot,
  onSlotEdit,
  onSprintSelect,
  onEditClose,
  syncing,
  onRefresh,
  onSprintListSelect,
  onAddSlotWithSprint,
  onReorderSlots,
}: {
  slotSprints: string[];
  activeSlot: number;
  sprints: Sprint[];
  onSlotClick: (idx: number) => void;
  editingSlot: number | null;
  onSlotEdit: (idx: number) => void;
  onSprintSelect: (sprintId: string) => void;
  onEditClose: () => void;
  syncing: boolean;
  onRefresh: () => void;
  onSprintListSelect: (sprintId: string) => void;
  onAddSlotWithSprint: (sprintId: string) => void;
  onReorderSlots: (activeId: string, overId: string) => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);

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
    <div className="flex items-center gap-1 border-b border-white/[0.06] px-5 pt-4 pb-0">
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
            const isActive = idx === activeSlot;
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

      {/* Add slot button - opens sprint modal */}
      {slotSprints.length < 4 && (
        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setAddModalOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/20 cursor-pointer hover:bg-white/[0.04] hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
            title="Pin a sprint"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {addModalOpen && (
            <SprintListModal
              onClose={() => setAddModalOpen(false)}
              onSelect={(id) => {
                onSprintListSelect(id);
                setAddModalOpen(false);
              }}
              onPin={(id) => onAddSlotWithSprint(id)}
              pinnedIds={new Set(slotSprints)}
              alignLeft
            />
          )}
        </div>
      )}

      {/* Right side: sprint list + refresh */}
      <div className="ml-auto flex items-center gap-2 pb-2.5">
        {/* Sprint list button */}
        <div className="relative">
          <SprintListButton
            onSelect={(id) => onSprintListSelect(id)}
            onPin={(id) => onAddSlotWithSprint(id)}
            pinnedIds={new Set(slotSprints)}
          />
        </div>

        {/* Refresh board */}
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
      </div>
    </div>
  );
}
