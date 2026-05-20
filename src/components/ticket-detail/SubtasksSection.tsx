"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { TicketDetail, JiraStatus, Subtask } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { Loader2, GripVertical } from "lucide-react";
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
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<Subtask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge server subtasks with locally added ones (that haven't appeared in server data yet)
  const mergedSubtasks = [
    ...subtasks,
    ...locallyAdded.filter((la) => !subtasks.some((s) => s.key === la.key)),
  ];
  const orderedSubtasks = localOrder ?? mergedSubtasks;

  const filtered = filter === "all"
    ? orderedSubtasks
    : orderedSubtasks.filter((s) => s.jiraStatus === filter);

  const countLabel = filter !== "all" && mergedSubtasks.length > 0
    ? `${filtered.length} of ${mergedSubtasks.length}`
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
      const created = await tickets.createSubtask(ticketKey, { title });
      // Show immediately via local state
      setLocallyAdded((prev) => [...prev, created]);
      setNewTitle("");
      setLocalOrder(null);
      onMutate();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : "Jira API error";
      setError(`Failed to create subtask: ${detail}`);
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
      setNewTitle("");
      inputRef.current?.blur();
    }
  }, [handleCreate]);

  const isDndEnabled = filter === "all" && filtered.length > 1;

  const subtaskRows = filtered.map((sub, idx) => (
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
  ));

  // Always-visible inline input row at the bottom of the list
  const inlineInput = (
    <div className={`flex items-center gap-3 px-3 py-2 ${filtered.length > 0 ? "border-t border-border-subtle" : ""}`}>
      <IssueTypeIcon type="subtask" size={14} />
      <input
        ref={inputRef}
        type="text"
        value={newTitle}
        onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="Create subtask..."
        disabled={isCreating}
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
      />
      {isCreating && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
    </div>
  );

  const listContent = (
    <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
      {subtaskRows}
      {inlineInput}
    </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Subtasks"
        count={filter === "all" ? mergedSubtasks.length : undefined}
        countLabel={countLabel}
      />

      {/* Status filter chips */}
      {mergedSubtasks.length > 0 && (
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

      {error && (
        <p className="mt-2 text-xs text-red-400/80">{error}</p>
      )}

      {/* Subtask list + inline input */}
      {filtered.length > 0 && isDndEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((s) => s.key)} strategy={verticalListSortingStrategy}>
            {listContent}
          </SortableContext>
        </DndContext>
      ) : filtered.length > 0 ? (
        listContent
      ) : mergedSubtasks.length > 0 ? (
        <>
          <p className="mt-3 text-sm text-text-muted">No subtasks matching this filter</p>
          {listContent}
        </>
      ) : (
        listContent
      )}
    </div>
  );
}
