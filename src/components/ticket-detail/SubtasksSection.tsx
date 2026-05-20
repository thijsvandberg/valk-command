"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { TicketDetail, JiraStatus, Subtask } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/Button";
import { tickets } from "@/lib/api-client";
import { Plus, Loader2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

type StatusFilter = "all" | JiraStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TO DO", label: "To Do" },
  { value: "IN PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

interface SubtasksSectionProps {
  subtasks: TicketDetail["subtasks"];
  ticketKey: string;
  onMutate: () => void;
}

function SortableSubtaskRow({ sub, isLast }: { sub: Subtask; isLast: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sub.key });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-3 py-2.5 ${
        isDragging ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg" : ""
      } ${!isLast && !isDragging ? "border-b border-border-subtle" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-0.5 text-text-muted opacity-0 transition-opacity duration-150 hover:text-text-secondary group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} strokeWidth={1.5} />
      </button>
      <IssueTypeIcon type={sub.type} size={14} />
      <Link
        href={`/tickets/${sub.key}`}
        className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        onClick={(e) => e.stopPropagation()}
      >
        {sub.key}
      </Link>
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{sub.title}</span>
      <StatusBadge status={sub.jiraStatus} />
      <Avatar assignee={sub.assignee} size={22} />
    </div>
  );
}

export function SubtasksSection({ subtasks, ticketKey, onMutate }: SubtasksSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use localOrder if available (during drag operations), otherwise use prop order
  const orderedSubtasks = localOrder ?? subtasks;

  const filtered = filter === "all"
    ? orderedSubtasks
    : orderedSubtasks.filter((s) => s.jiraStatus === filter);

  const countLabel = filter !== "all" && subtasks.length > 0
    ? `${filtered.length} of ${subtasks.length}`
    : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedSubtasks.findIndex((s) => s.key === active.id);
    const newIndex = orderedSubtasks.findIndex((s) => s.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedSubtasks, oldIndex, newIndex);
    setLocalOrder(reordered);

    const movedKey = active.id as string;
    // Determine ranking reference
    const rankBefore = newIndex < reordered.length - 1 ? reordered[newIndex + 1].key : undefined;
    const rankAfter = newIndex > 0 && !rankBefore ? reordered[newIndex - 1].key : undefined;

    try {
      await tickets.rankSubtasks(ticketKey, {
        orderedKeys: reordered.map((s) => s.key),
        movedKey,
        rankBefore,
        rankAfter,
      });
      onMutate();
    } catch (err) {
      setError("Failed to reorder. Jira ranking may be unavailable.");
      console.error("Failed to rank subtasks:", err);
      setLocalOrder(null);
    }
  }, [orderedSubtasks, ticketKey, onMutate]);

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      await tickets.createSubtask(ticketKey, { title });
      setNewTitle("");
      setShowForm(false);
      setLocalOrder(null);
      onMutate();
    } catch (err) {
      setError("Failed to create subtask. Check Jira connection.");
      console.error("Failed to create subtask:", err);
    } finally {
      setIsCreating(false);
    }
  }, [newTitle, isCreating, ticketKey, onMutate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      setShowForm(false);
      setNewTitle("");
    }
  }, [handleCreate]);

  const openForm = useCallback(() => {
    setShowForm(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // DnD only works when showing all subtasks (not filtered)
  const isDndEnabled = filter === "all" && filtered.length > 1;

  const subtaskList = (
    <div className={`${showForm ? "mt-2" : "mt-3"} overflow-hidden rounded-lg border border-border-default`}>
      {filtered.map((sub, idx) => (
        isDndEnabled ? (
          <SortableSubtaskRow key={sub.key} sub={sub} isLast={idx === filtered.length - 1} />
        ) : (
          <div
            key={sub.key}
            className={`group flex items-center gap-3 px-3 py-2.5 ${
              idx < filtered.length - 1 ? "border-b border-border-subtle" : ""
            }`}
          >
            <IssueTypeIcon type={sub.type} size={14} />
            <Link
              href={`/tickets/${sub.key}`}
              className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              onClick={(e) => e.stopPropagation()}
            >
              {sub.key}
            </Link>
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{sub.title}</span>
            <StatusBadge status={sub.jiraStatus} />
            <Avatar assignee={sub.assignee} size={22} />
          </div>
        )
      ))}
    </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Subtasks"
        count={filter === "all" ? subtasks.length : undefined}
        countLabel={countLabel}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={12} strokeWidth={2} />}
            onClick={openForm}
            aria-label="Add subtask"
          >
            Add
          </Button>
        }
      />

      {/* Status filter chips */}
      {subtasks.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  isActive
                    ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/25"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-overlay-default border border-transparent"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Inline creation form */}
      {showForm && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] px-3 py-2">
          <IssueTypeIcon type="subtask" size={14} />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Subtask title..."
            disabled={isCreating}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!newTitle.trim() || isCreating}
            icon={isCreating ? <Loader2 size={11} className="animate-spin" /> : undefined}
          >
            Create
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowForm(false); setNewTitle(""); }}
            disabled={isCreating}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400/80">{error}</p>
      )}

      {/* Subtask list */}
      {filtered.length > 0 ? (
        isDndEnabled ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((s) => s.key)} strategy={verticalListSortingStrategy}>
              {subtaskList}
            </SortableContext>
          </DndContext>
        ) : subtaskList
      ) : subtasks.length > 0 ? (
        <p className="mt-3 text-sm text-text-muted">No subtasks matching this filter</p>
      ) : !showForm ? (
        <p className="mt-3 text-sm text-text-muted">No subtasks</p>
      ) : null}
    </div>
  );
}
