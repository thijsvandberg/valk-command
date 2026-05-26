"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TicketDetail, JiraStatus, Subtask, SubtaskSuggestionResponse } from "@/types/ticket";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { Loader2, GripVertical, ExternalLink, Filter, Eye, EyeOff, Sparkles } from "lucide-react";
import { SubtaskSuggestions } from "./SubtaskSuggestions";
import { attachTaskStreamListeners } from "@/hooks/useStreamingTask";
import { parseSubtaskSuggestions } from "@/lib/parse-subtask-suggestions";
import { friendlyStreamError, isRetryableStreamError } from "@/lib/agent-errors";
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
      {!hideKey && (
        <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">
          {sub.key}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{sub.title}</span>
      <StatusBadge status={sub.jiraStatus} />
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
  const [suggestions, setSuggestions] = useState<SubtaskSuggestionResponse[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestProgress, setSuggestProgress] = useState<string | null>(null);
  const [addingIndices, setAddingIndices] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestEsRef = useRef<EventSource | null>(null);
  const suggestRetryRef = useRef(0);
  const handleSuggestRef = useRef<(isRetry?: boolean) => void>(() => {});

  // Load persisted suggestions on mount
  useEffect(() => {
    let cancelled = false;
    tickets.getSubtaskSuggestions(ticketKey).then((data) => {
      if (!cancelled && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    }).catch(() => {
      // Silently ignore load errors
    });
    return () => { cancelled = true; };
  }, [ticketKey]);

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

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      suggestEsRef.current?.close();
      suggestEsRef.current = null;
    };
  }, []);

  const handleSuggest = useCallback(async (isRetry = false) => {
    if (suggestLoading && !isRetry) return;

    if (!isRetry) {
      suggestRetryRef.current = 0;
    }

    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestProgress(isRetry ? "Retrying..." : "Starting...");
    setSuggestions([]);

    try {
      const data = await tickets.suggestSubtasks(ticketKey);
      if (!data.taskId || !data.streamUrl) {
        setSuggestError("No task ID returned from workspace");
        setSuggestLoading(false);
        return;
      }

      const es = new EventSource(data.streamUrl);
      suggestEsRef.current = es;

      attachTaskStreamListeners(es, {
        onProgress: (message) => setSuggestProgress(message),
        onToolCall: (tool) => {
          const clean = tool.replace("mcp__jira__", "").replace("mcp__", "");
          setSuggestProgress(`Using ${clean}...`);
        },
        onResult: (resultData) => {
          es.close();
          suggestEsRef.current = null;
          const output = (resultData.output as string) ?? "";
          const parsed = parseSubtaskSuggestions(output);
          setSuggestLoading(false);
          setSuggestProgress(null);

          // Persist to DB, then update state with IDs
          tickets.persistSubtaskSuggestions(ticketKey, { suggestions: parsed })
            .then((data) => setSuggestions(data.suggestions))
            .catch(() => {
              // Fallback: use ephemeral suggestions without IDs
              setSuggestions(parsed.map((title, i) => ({
                id: `ephemeral-${i}`,
                ticketKey,
                title,
                createdAt: new Date().toISOString(),
              })));
            });
        },
        onStructuredError: (message) => {
          es.close();
          suggestEsRef.current = null;

          if (isRetryableStreamError(message) && suggestRetryRef.current < 1) {
            suggestRetryRef.current += 1;
            handleSuggestRef.current(true);
            return;
          }

          setSuggestError(friendlyStreamError(message));
          setSuggestLoading(false);
          setSuggestProgress(null);
        },
        onNetworkError: () => {
          es.close();
          suggestEsRef.current = null;
          setSuggestError("Connection to workspace lost");
          setSuggestLoading(false);
          setSuggestProgress(null);
        },
      });
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Failed to start suggestion");
      setSuggestLoading(false);
      setSuggestProgress(null);
    }
  }, [ticketKey, suggestLoading]);

  useEffect(() => {
    handleSuggestRef.current = handleSuggest;
  }, [handleSuggest]);

  const addSuggestionAsSubtask = useCallback(async (suggestion: SubtaskSuggestionResponse, index: number) => {
    setAddingIndices((prev) => new Set(prev).add(index));

    const placeholderKey = `pending-suggest-${Date.now()}`;
    const placeholder: Subtask = {
      key: placeholderKey,
      title: suggestion.title,
      type: "subtask",
      jiraStatus: "TO DO",
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setLocalOrder(null);

    try {
      const created = await tickets.createSubtask(ticketKey, { title: suggestion.title });
      setLocallyAdded((prev) => prev.map((s) => s.key === placeholderKey ? created : s));
      setSuggestions((prev) => prev.filter((_, i) => i !== index));
      onMutate();
      // Remove accepted suggestion from DB
      if (!suggestion.id.startsWith("ephemeral-")) {
        tickets.dismissSubtaskSuggestion(ticketKey, { id: suggestion.id }).catch(() => {});
      }
    } catch (err) {
      setLocallyAdded((prev) => prev.filter((s) => s.key !== placeholderKey));
      const detail = err instanceof ApiError ? err.message : "Jira API error";
      setError(`Failed to create subtask: ${detail}`);
    }

    setAddingIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, [ticketKey, onMutate]);

  const handleAddSuggestion = useCallback((index: number) => {
    const suggestion = suggestions[index];
    if (suggestion) addSuggestionAsSubtask(suggestion, index);
  }, [suggestions, addSuggestionAsSubtask]);

  const handleAddAllSuggestions = useCallback(async () => {
    const toAdd = [...suggestions];
    for (let i = 0; i < toAdd.length; i++) {
      await addSuggestionAsSubtask(toAdd[i], i);
    }
  }, [suggestions, addSuggestionAsSubtask]);

  const handleDismissSuggestion = useCallback((index: number) => {
    const suggestion = suggestions[index];
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
    // Remove from DB
    if (suggestion && !suggestion.id.startsWith("ephemeral-")) {
      tickets.dismissSubtaskSuggestion(ticketKey, { id: suggestion.id }).catch(() => {});
    }
  }, [suggestions, ticketKey]);

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

  // Suggest subtasks button with pending count badge
  const suggestButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => handleSuggest()}
        disabled={suggestLoading}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 ${
          suggestLoading
            ? "text-[var(--color-brand-400)]"
            : suggestions.length > 0
              ? "text-[var(--color-brand-400)]"
              : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title={suggestions.length > 0 ? `${suggestions.length} pending AI suggestions` : "Suggest subtasks with AI"}
      >
        {suggestLoading ? (
          <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <Sparkles size={13} strokeWidth={1.5} />
        )}
      </button>
      {suggestions.length > 0 && !suggestLoading && (
        <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-0.5 text-[9px] font-semibold text-white">
          {suggestions.length}
        </span>
      )}
    </div>
  );

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
          actions={<>{suggestButton}{compactFilters && filterButton}</>}
        />
      )}

      {hideHeader && (
        <div className="flex items-center gap-1">
          {suggestButton}
          {compactFilters && filterButton}
        </div>
      )}

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

      {/* AI-suggested subtasks */}
      <SubtaskSuggestions
        suggestions={suggestions}
        isLoading={suggestLoading}
        progressText={suggestProgress}
        error={suggestError}
        addingIndices={addingIndices}
        onAdd={handleAddSuggestion}
        onAddAll={handleAddAllSuggestions}
        onDismiss={handleDismissSuggestion}
      />
    </div>
  );
}
