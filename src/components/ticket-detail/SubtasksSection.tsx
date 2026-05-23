"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TicketDetail, JiraStatus, Subtask } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { Loader2, GripVertical, ExternalLink, Filter, Eye, EyeOff } from "lucide-react";
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
  onSelectTicket?: (key: string) => void;
  hideHeader?: boolean;
  compactFilters?: boolean;
  defaultHideKeys?: boolean;
  showDragHandles?: boolean;
}

function SortableSubtaskRow({
  sub,
  isLast,
  onSelect,
  hideKey,
  showDragHandle,
}: {
  sub: Subtask;
  isLast: boolean;
  onSelect?: (key: string) => void;
  hideKey?: boolean;
  showDragHandle?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
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

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(`/tickets/${sub.key}`, "_blank");
      return;
    }
    if (onSelect) {
      e.preventDefault();
      onSelect(sub.key);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2.5 ${
        onSelect ? "cursor-pointer hover:bg-overlay-subtle" : ""
      } ${isDragging ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg" : ""} ${
        !isLast && !isDragging ? "border-b border-border-subtle" : ""
      }`}
      onClick={handleClick}
      {...(showDragHandle ? {} : { ...attributes, ...listeners })}
    >
      {showDragHandle && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab text-text-muted opacity-40 hover:opacity-100 active:cursor-grabbing"
          style={{ transition: "opacity 0.15s ease" }}
        >
          <GripVertical size={12} strokeWidth={1.5} />
        </span>
      )}
      <IssueTypeIcon type={sub.type} size={14} />
      {!hideKey && (
        <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">
          {sub.key}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{sub.title}</span>
      <StatusBadge status={sub.jiraStatus} />
      <Avatar assignee={sub.assignee} size={22} />
      {/* Open in new tab */}
      <a
        href={`/tickets/${sub.key}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-secondary focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease" }}
        title="Open in new tab"
      >
        <ExternalLink size={12} strokeWidth={1.5} />
      </a>
    </div>
  );
}

function FilterPopover({
  filter,
  setFilter,
  statusCounts,
  hideKeys,
  setHideKeys,
  onClose,
}: {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  hideKeys: boolean;
  setHideKeys: (v: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
      style={{ animation: "fadeInUp 0.1s ease" }}
    >
      <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
        Status
      </div>
      {FILTER_OPTIONS.map((opt) => {
        const isActive = filter === opt.value;
        const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
        if (opt.value !== "all" && count === 0) return null;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-xs hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className={isActive ? "font-medium text-text-primary" : "text-text-secondary"}>
              {opt.label}
            </span>
            <span className="ml-auto tabular-nums text-caption text-text-muted">{count}</span>
          </button>
        );
      })}
      <div className="my-1 h-px bg-border-subtle" />
      <button
        type="button"
        onClick={() => setHideKeys(!hideKeys)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-xs hover:bg-hover-list-item active:bg-overlay-default"
      >
        {hideKeys ? (
          <Eye size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        ) : (
          <EyeOff size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        )}
        <span className="text-text-secondary">{hideKeys ? "Show issue keys" : "Hide issue keys"}</span>
      </button>
    </div>
  );
}

export function SubtasksSection({
  subtasks,
  ticketKey,
  onMutate,
  onSelectTicket,
  hideHeader,
  compactFilters,
  defaultHideKeys,
  showDragHandles,
}: SubtasksSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<Subtask[]>([]);
  const [hideKeys, setHideKeys] = useState(defaultHideKeys ?? false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
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

  // Counts per status for filter chips
  const statusCounts = {
    all: mergedSubtasks.length,
    "TO DO": mergedSubtasks.filter((s) => s.jiraStatus === "TO DO").length,
    "IN PROGRESS": mergedSubtasks.filter((s) => s.jiraStatus === "IN PROGRESS").length,
    DONE: mergedSubtasks.filter((s) => s.jiraStatus === "DONE").length,
  };

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

  const handleCreate = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;

    // Optimistically add a placeholder row and clear input immediately
    const placeholderKey = `pending-${Date.now()}`;
    const placeholder: Subtask = {
      key: placeholderKey,
      title,
      type: "subtask",
      jiraStatus: "TO DO",
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setNewTitle("");
    setError(null);
    setLocalOrder(null);

    // Create in background
    tickets.createSubtask(ticketKey, { title })
      .then((created) => {
        // Replace placeholder with real subtask
        setLocallyAdded((prev) =>
          prev.map((s) => s.key === placeholderKey ? created : s),
        );
        onMutate();
      })
      .catch((err) => {
        // Remove placeholder on failure
        setLocallyAdded((prev) => prev.filter((s) => s.key !== placeholderKey));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to create subtask: ${detail}`);
        console.error("Failed to create subtask:", err);
      });
  }, [newTitle, ticketKey, onMutate]);

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

  const subtaskRows = filtered.map((sub, idx) => {
    const isPending = sub.key.startsWith("pending-");
    if (isDndEnabled && !isPending) {
      return (
        <SortableSubtaskRow
          key={sub.key}
          sub={sub}
          isLast={idx === filtered.length - 1}
          onSelect={onSelectTicket}
          hideKey={hideKeys}
          showDragHandle={showDragHandles}
        />
      );
    }
    return (
      <div
        key={sub.key}
        className={`group flex items-center gap-2 px-3 py-2.5 ${
          onSelectTicket && !isPending ? "cursor-pointer hover:bg-overlay-subtle" : ""
        } ${idx < filtered.length - 1 ? "border-b border-border-subtle" : ""} ${
          isPending ? "opacity-50" : ""
        }`}
        onClick={!isPending && onSelectTicket ? (e) => {
          if (e.metaKey || e.ctrlKey) {
            window.open(`/tickets/${sub.key}`, "_blank");
            return;
          }
          onSelectTicket(sub.key);
        } : undefined}
      >
        <IssueTypeIcon type={sub.type} size={14} />
        {isPending ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" />
          </span>
        ) : !hideKeys ? (
          <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">
            {sub.key}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{sub.title}</span>
        <StatusBadge status={sub.jiraStatus} />
        <Avatar assignee={sub.assignee} size={22} />
        {/* Open in new tab */}
        {!isPending && (
          <a
            href={`/tickets/${sub.key}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-secondary focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "opacity 0.15s ease, color 0.15s ease" }}
            title="Open in new tab"
          >
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        )}
      </div>
    );
  });

  // Always-visible inline input row at the bottom of the list
  const inlineInput = (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${filtered.length > 0 ? "border-t border-border-subtle" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {showDragHandles && <span className="w-3 shrink-0" />}
      <IssueTypeIcon type="subtask" size={14} />
      <input
        ref={inputRef}
        type="text"
        value={newTitle}
        onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="Create subtask..."
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
      />
    </div>
  );

  const listContent = (
    <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
      {subtaskRows}
      {inlineInput}
    </div>
  );

  const isFiltered = filter !== "all";

  // Filter button for compact mode
  const filterButton = compactFilters ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setFilterPopoverOpen((v) => !v)}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          filterPopoverOpen || isFiltered
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title="Filter subtasks"
      >
        <Filter size={13} strokeWidth={1.5} />
      </button>
      {filterPopoverOpen && (
        <FilterPopover
          filter={filter}
          setFilter={(f) => { setFilter(f); }}
          statusCounts={statusCounts}
          hideKeys={hideKeys}
          setHideKeys={setHideKeys}
          onClose={() => setFilterPopoverOpen(false)}
        />
      )}
    </div>
  ) : null;

  return (
    <div className={hideHeader ? "" : "mt-8"}>
      {!hideHeader && (
        <SectionHeader
          title="Subtasks"
          count={filter === "all" ? mergedSubtasks.length : undefined}
          countLabel={filter !== "all" && mergedSubtasks.length > 0 ? `${filtered.length} of ${mergedSubtasks.length}` : undefined}
          actions={compactFilters ? filterButton : undefined}
        />
      )}

      {hideHeader && compactFilters && filterButton}

      {/* Inline filter chips (non-compact mode only) */}
      {!compactFilters && mergedSubtasks.length > 0 && (
        <div className="mt-3 flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
            if (opt.value !== "all" && count === 0) return null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  isActive
                    ? "bg-[var(--color-surface-elevated)] text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {opt.label}
                <span className={`tabular-nums text-[10px] ${isActive ? "text-text-secondary" : "text-text-muted"}`}>
                  {count}
                </span>
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
