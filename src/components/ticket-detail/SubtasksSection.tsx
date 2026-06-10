"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { TicketDetail, Subtask, SubtaskSuggestionResponse, JiraStatus } from "@/types/ticket";
import { Avatar } from "@/components/shared/Avatar";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueListHeader } from "./ChildIssueListHeader";
import { FieldFilterPopover, type StatusFilter } from "./FieldFilterPopover";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { useSectionCollapsed } from "@/hooks/useSectionCollapsed";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { tickets, jira } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { GripVertical, Filter, Sparkles, Undo2, Loader2, X, SquarePen, AlertTriangle } from "lucide-react";
import { SubtaskSuggestions } from "./SubtaskSuggestions";
import { useTaskStream } from "@/hooks/useTaskStream";
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

const SUBTASK_FIELDS = [
  { id: "issueType", label: "issue icon" },
  { id: "issueKey", label: "issue keys" },
  { id: "status", label: "status" },
  { id: "assignee", label: "assignees" },
];

interface SubtasksSectionProps {
  subtasks: TicketDetail["subtasks"];
  ticketKey: string;
  onMutate: () => void;
  // Optimistically patch a subtask's status in the parent detail cache. When wired, the
  // row updates instantly instead of waiting on a revalidation that returns stale data.
  onSubtaskStatusOptimistic?: (childKey: string, status: JiraStatus) => void;
  onSelectTicket?: (key: string) => void;
  hideHeader?: boolean;
  compactFilters?: boolean;
  defaultHideKeys?: boolean;
  showDragHandles?: boolean;
  // When set, the heading renders without a collapse toggle and the body is
  // always shown. Used where collapsing is redundant (e.g. the refinement
  // session sidebar pane, which can be closed entirely instead).
  disableCollapse?: boolean;
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80"
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      title="Rename subtask"
    >
      <SquarePen size={13} strokeWidth={2} />
      <span>Edit</span>
    </button>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      title="Delete subtask"
    >
      <X size={14} strokeWidth={2} />
      <span>Delete</span>
    </button>
  );
}

function SortableSubtaskRow({
  sub,
  isLast,
  onSelect,
  showTypeIcon,
  showKey,
  showStatus,
  showAssignee,
  showDragHandle,
  displayTitle,
  isEditing,
  editValue,
  onEditChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onJiraStatusChange,
  onAssigneeChange,
}: {
  sub: Subtask;
  isLast: boolean;
  onSelect?: (key: string) => void;
  showTypeIcon: boolean;
  showKey: boolean;
  showStatus: boolean;
  showAssignee: boolean;
  showDragHandle?: boolean;
  displayTitle: string;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onJiraStatusChange?: (status: JiraStatus) => void;
  onAssigneeChange: (user: AssignableUser | null) => void;
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

  const dragHandle = showDragHandle ? (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="flex shrink-0 cursor-grab items-center text-text-muted hover:!opacity-100 active:cursor-grabbing"
    >
      <GripVertical size={12} strokeWidth={1.5} />
    </span>
  ) : undefined;

  const itemWithTitle = { ...sub, title: displayTitle };

  return (
    <ChildIssueRow
      ref={setNodeRef}
      item={itemWithTitle}
      isLast={isLast}
      showTypeIcon={showTypeIcon}
      showReadiness={false}
      showKey={showKey}
      showStatus={showStatus}
      onJiraStatusChange={onJiraStatusChange}
      onSelect={onSelect}
      isEditing={isEditing}
      editValue={editValue}
      onEditChange={onEditChange}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      metadataSlot={showAssignee ? (
        <AssigneePicker
          variant="avatar"
          avatarSize={22}
          align="right"
          value={sub.assignee}
          onChange={onAssigneeChange}
        />
      ) : undefined}
      actionsSlot={
        <>
          <EditButton onClick={onStartEdit} />
          <DeleteButton onClick={onDelete} />
        </>
      }
      dragHandleSlot={dragHandle}
      style={style}
      className={isDragging ? "bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg" : ""}
      dndProps={showDragHandle ? {} : { ...attributes, ...listeners }}
    />
  );
}


export function SubtasksSection({
  subtasks,
  ticketKey,
  onMutate,
  onSubtaskStatusOptimistic,
  onSelectTicket,
  hideHeader,
  compactFilters,
  defaultHideKeys,
  showDragHandles,
  disableCollapse,
}: SubtasksSectionProps) {
  const [filter, setFilter] = useLocalStorage<StatusFilter>("subtask-status-filter", "all");
  const [hideDeprecated, setHideDeprecated] = useLocalStorage<boolean>("subtask-hide-deprecated", true);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jiraWarning, setJiraWarning] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<Subtask[]>([]);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SubtaskSuggestionResponse[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestProgress, setSuggestProgress] = useState<string | null>(null);
  const [addingIndices, setAddingIndices] = useState<Set<number>>(new Set());
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [localRenames, setLocalRenames] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ sub: Subtask; index: number } | null>(null);
  const [flushedDeleteKeys, setFlushedDeleteKeys] = useState<Set<string>>(new Set());
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editCancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestTaskId, setSuggestTaskId] = useState<string | null>(null);
  const suggestRetryRef = useRef(0);
  const handleSuggestRef = useRef<(isRetry?: boolean) => void>(() => {});
  const defaultVisible = defaultHideKeys ? ["issueType", "status"] : ["issueType", "issueKey", "status"];
  const { visible: visibleFields, toggleField } = useSectionVisibility("subtasks", defaultVisible);
  const { isCollapsed } = useSectionCollapsed();
  // Collapse only applies when this section renders its own heading; embedded
  // (hideHeader) usages have no toggle and always show their body.
  const collapsed = !hideHeader && !disableCollapse && isCollapsed(SECTION_KEYS.subtasks);

  // Load persisted suggestions on mount
  useEffect(() => {
    let cancelled = false;
    tickets.getSubtaskSuggestions(ticketKey).then((data) => {
      if (!cancelled && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticketKey]);

  const mergedSubtasks = useMemo(() => [
    ...subtasks,
    ...locallyAdded.filter((la) => !subtasks.some((s) => s.key === la.key)),
  ], [subtasks, locallyAdded]);
  const orderedSubtasks = localOrder ?? mergedSubtasks;

  const hiddenKeys = useMemo(() => {
    const keys = new Set(flushedDeleteKeys);
    if (pendingDelete) keys.add(pendingDelete.sub.key);
    return keys;
  }, [flushedDeleteKeys, pendingDelete]);

  const visibleSubtasks = hiddenKeys.size > 0
    ? orderedSubtasks.filter((s) => !hiddenKeys.has(s.key))
    : orderedSubtasks;

  // Deprecated subtasks are treated as noise, so they are hidden by default and
  // can be revealed via the filter toggle.
  const activeSubtasks = hideDeprecated
    ? visibleSubtasks.filter((s) => s.jiraStatus !== "DEPRECATED")
    : visibleSubtasks;

  const filtered = filter === "all"
    ? activeSubtasks
    : activeSubtasks.filter((s) => s.jiraStatus === filter);

  const countBase = hiddenKeys.size > 0
    ? mergedSubtasks.filter((s) => !hiddenKeys.has(s.key))
    : mergedSubtasks;
  const deprecatedCount = countBase.filter((s) => s.jiraStatus === "DEPRECATED").length;
  const visibleCountBase = hideDeprecated
    ? countBase.filter((s) => s.jiraStatus !== "DEPRECATED")
    : countBase;
  const statusCounts = {
    all: visibleCountBase.length,
    "TO DO": visibleCountBase.filter((s) => s.jiraStatus === "TO DO").length,
    "IN PROGRESS": visibleCountBase.filter((s) => s.jiraStatus === "IN PROGRESS").length,
    DONE: visibleCountBase.filter((s) => s.jiraStatus === "DONE").length,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleJiraStatusChange = useCallback(async (childKey: string, status: JiraStatus) => {
    setJiraWarning(null);
    // Patch the row optimistically. The child status endpoint does not invalidate the
    // parent detail cache reliably (cross-route invalidation is unreliable in dev), so a
    // bare revalidation would return the stale subtask status.
    onSubtaskStatusOptimistic?.(childKey, status);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(childKey)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJiraWarning(data.error ?? "Failed to update status");
        onMutate(); // revalidate to roll back the optimistic patch
        return;
      }
      if (data.jiraWarning) {
        setJiraWarning(`${childKey}: status updated locally, but Jira sync failed`);
      }
      // On success keep the optimistic value. Fall back to a revalidation only when no
      // optimistic handler is wired (callers without parent-cache access).
      if (!onSubtaskStatusOptimistic) onMutate();
    } catch (err) {
      console.error("Failed to update status:", err);
      setJiraWarning("Failed to update status");
      onMutate(); // revalidate to roll back the optimistic patch
    }
  }, [onMutate, onSubtaskStatusOptimistic]);

  const handleAssigneeChange = useCallback(async (childKey: string, user: AssignableUser | null) => {
    setJiraWarning(null);
    try {
      await jira.assign({ issueKey: childKey, accountId: user?.accountId ?? null, name: user?.displayName ?? null });
      onMutate();
    } catch (err) {
      console.error("Failed to update assignee:", err);
      setJiraWarning(`${childKey}: failed to update assignee`);
    }
  }, [onMutate]);

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

    tickets.createSubtask(ticketKey, { title })
      .then((created) => {
        setLocallyAdded((prev) =>
          prev.map((s) => s.key === placeholderKey ? created : s),
        );
        onMutate();
      })
      .catch((err) => {
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

  const handleStartEdit = useCallback((key: string, title: string) => {
    editCancelledRef.current = false;
    setEditingKey(key);
    setEditingTitle(title);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      return;
    }
    if (!editingKey) return;

    const trimmed = editingTitle.trim();
    const originalSub = mergedSubtasks.find((s) => s.key === editingKey);
    if (!trimmed || trimmed === originalSub?.title) {
      setEditingKey(null);
      setEditingTitle("");
      return;
    }

    setLocalRenames((prev) => ({ ...prev, [editingKey]: trimmed }));
    const savedKey = editingKey;
    setEditingKey(null);
    setEditingTitle("");
    setError(null);

    tickets.renameSubtask(ticketKey, savedKey, { title: trimmed })
      .then(() => onMutate())
      .catch((err) => {
        setLocalRenames((prev) => {
          const next = { ...prev };
          delete next[savedKey];
          return next;
        });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to rename subtask: ${detail}`);
      });
  }, [editingKey, editingTitle, mergedSubtasks, ticketKey, onMutate]);

  const handleCancelEdit = useCallback(() => {
    editCancelledRef.current = true;
    setEditingKey(null);
    setEditingTitle("");
  }, []);

  const flushDelete = useCallback((sub: Subtask) => {
    setFlushedDeleteKeys((prev) => new Set(prev).add(sub.key));
    tickets.deleteSubtask(ticketKey, sub.key)
      .then(() => onMutate())
      .catch((err) => {
        setFlushedDeleteKeys((prev) => {
          const next = new Set(prev);
          next.delete(sub.key);
          return next;
        });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to delete subtask: ${detail}`);
      });
  }, [ticketKey, onMutate]);

  const handleDelete = useCallback((sub: Subtask, index: number) => {
    if (pendingDelete) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      flushDelete(pendingDelete.sub);
    }

    setPendingDelete({ sub, index });
    pendingDeleteTimerRef.current = setTimeout(() => {
      flushDelete(sub);
      setPendingDelete(null);
      pendingDeleteTimerRef.current = null;
    }, 5000);
  }, [pendingDelete, flushDelete]);

  const handleUndoDelete = useCallback(() => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    pendingDeleteTimerRef.current = null;
    setPendingDelete(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) {
        clearTimeout(pendingDeleteTimerRef.current);
      }
    };
  }, []);

  useTaskStream(suggestTaskId, {
    timeout: 0,
    onProgress: (message) => setSuggestProgress(message),
    onToolCall: (tool) => {
      const clean = tool.replace("mcp__jira__", "").replace("mcp__", "");
      setSuggestProgress(`Using ${clean}...`);
    },
    onResult: (resultData) => {
      const output = (resultData.output as string) ?? "";
      const parsed = parseSubtaskSuggestions(output);
      setSuggestLoading(false);
      setSuggestProgress(null);
      setSuggestionsVisible(true);
      setSuggestionsExpanded(true);

      tickets.persistSubtaskSuggestions(ticketKey, { suggestions: parsed })
        .then((data) => setSuggestions(data.suggestions))
        .catch(() => {
          setSuggestions(parsed.map((title, i) => ({
            id: `ephemeral-${i}`,
            ticketKey,
            title,
            createdAt: new Date().toISOString(),
          })));
        });
    },
    onError: (message) => {
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
      setSuggestError("Connection to workspace lost");
      setSuggestLoading(false);
      setSuggestProgress(null);
    },
  });

  const handleSuggest = useCallback(async (isRetry = false) => {
    if (suggestLoading && !isRetry) return;

    if (!isRetry) {
      suggestRetryRef.current = 0;
    }

    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestProgress(isRetry ? "Retrying..." : "Starting...");
    setSuggestions([]);
    setSuggestTaskId(null);

    try {
      const data = await tickets.suggestSubtasks(ticketKey);
      if (!data.taskId || !data.streamUrl) {
        setSuggestError("No task ID returned from workspace");
        setSuggestLoading(false);
        return;
      }

      setSuggestTaskId(data.taskId);
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

  const handleAddSuggestion = useCallback((index: number, editedTitle?: string) => {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    const toAdd = editedTitle ? { ...suggestion, title: editedTitle } : suggestion;
    addSuggestionAsSubtask(toAdd, index);
  }, [suggestions, addSuggestionAsSubtask]);

  const handleAddAllSuggestions = useCallback(() => {
    const toAdd = [...suggestions];
    Promise.all(toAdd.map((s, i) => addSuggestionAsSubtask(s, i)));
  }, [suggestions, addSuggestionAsSubtask]);

  const handleDismissSuggestion = useCallback((index: number) => {
    const suggestion = suggestions[index];
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
    if (suggestion && !suggestion.id.startsWith("ephemeral-")) {
      tickets.dismissSubtaskSuggestion(ticketKey, { id: suggestion.id }).catch(() => {});
    }
  }, [suggestions, ticketKey]);

  const isDndEnabled = filter === "all" && filtered.length > 1;
  const isFiltered = filter !== "all" || (hideDeprecated && deprecatedCount > 0);
  const showType = visibleFields.has("issueType");
  const showKey = visibleFields.has("issueKey");
  const showStatus = visibleFields.has("status");
  const showAssignee = visibleFields.has("assignee");

  const subtaskRows = filtered.map((sub, idx) => {
    const isPending = sub.key.startsWith("pending-");
    const displayTitle = localRenames[sub.key] ?? sub.title;

    if (isDndEnabled && !isPending) {
      return (
        <SortableSubtaskRow
          key={sub.key}
          sub={sub}
          isLast={idx === filtered.length - 1}
          onSelect={onSelectTicket}
          showTypeIcon={showType}
          showKey={showKey}
          showStatus={showStatus}
          showAssignee={showAssignee}
          showDragHandle={showDragHandles}
          displayTitle={displayTitle}
          isEditing={editingKey === sub.key}
          editValue={editingTitle}
          onEditChange={setEditingTitle}
          onStartEdit={() => handleStartEdit(sub.key, displayTitle)}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDelete={() => handleDelete(sub, idx)}
          onJiraStatusChange={(s) => handleJiraStatusChange(sub.key, s)}
          onAssigneeChange={(u) => handleAssigneeChange(sub.key, u)}
        />
      );
    }

    const itemWithTitle = { ...sub, title: displayTitle };

    return (
      <ChildIssueRow
        key={sub.key}
        item={itemWithTitle}
        isLast={idx === filtered.length - 1}
        isPending={isPending}
        showTypeIcon={showType}
        showReadiness={false}
        showKey={showKey}
        showStatus={showStatus}
        onJiraStatusChange={!isPending ? (s) => handleJiraStatusChange(sub.key, s) : undefined}
        onSelect={onSelectTicket}
        isEditing={!isPending && editingKey === sub.key}
        editValue={editingTitle}
        onEditChange={setEditingTitle}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        metadataSlot={showAssignee ? (
          isPending ? (
            <Avatar assignee={sub.assignee} size={22} />
          ) : (
            <AssigneePicker
              variant="avatar"
              avatarSize={22}
              align="right"
              value={sub.assignee}
              onChange={(u) => handleAssigneeChange(sub.key, u)}
            />
          )
        ) : undefined}
        actionsSlot={!isPending ? (
          <>
            <EditButton onClick={() => handleStartEdit(sub.key, displayTitle)} />
            <DeleteButton onClick={() => handleDelete(sub, idx)} />
          </>
        ) : undefined}
      />
    );
  });

  const inlineInput = (
    <div
      className={`flex items-center px-3 py-2 ${filtered.length > 0 ? "border-t border-border-subtle" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={newTitle}
        onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="Create subtask..."
        className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
      />
    </div>
  );

  const listContent = (
    // overflow-clip + clip-margin still clips rows to the rounded corners, but lets the
    // drag handle straddle the left border by a few px instead of being cut off (overflow-hidden would clip it).
    <div className="mt-3 overflow-clip [overflow-clip-margin:0.75rem] rounded-lg border border-border-default">
      {subtaskRows}
      {inlineInput}
    </div>
  );

  const handleSuggestAction = () => {
    setSuggestionsVisible(true);
    setSuggestionsExpanded(true);
    if (suggestions.length === 0) handleSuggest();
  };

  const suggestButton = (
    <div className="relative">
      <button
        type="button"
        onClick={handleSuggestAction}
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

  // Compact filter button for hideHeader mode (the ChildIssueListHeader has its own built-in filter button)
  const compactFilterButton = (
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
        <FieldFilterPopover
          filter={filter}
          setFilter={setFilter}
          statusCounts={statusCounts}
          fields={SUBTASK_FIELDS}
          visibleFields={visibleFields}
          onToggleField={(id, show) => toggleField(id, show)}
          hideDeprecated={hideDeprecated}
          onToggleHideDeprecated={setHideDeprecated}
          deprecatedCount={deprecatedCount}
          onClose={() => setFilterPopoverOpen(false)}
        />
      )}
    </div>
  );

  return (
    <div className={hideHeader ? "" : "mt-8"}>
      {!hideHeader && (
        <ChildIssueListHeader
          title="Subtasks"
          totalCount={countBase.length}
          filteredCount={filtered.length}
          isFiltered={isFiltered}
          filter={filter}
          setFilter={setFilter}
          statusCounts={statusCounts}
          fields={SUBTASK_FIELDS}
          visibleFields={visibleFields}
          onToggleField={(id, show) => toggleField(id, show)}
          hideDeprecated={hideDeprecated}
          onToggleHideDeprecated={setHideDeprecated}
          deprecatedCount={deprecatedCount}
          onSuggest={handleSuggestAction}
          suggestLoading={suggestLoading}
          suggestCount={suggestions.length}
          sectionKey={disableCollapse ? undefined : SECTION_KEYS.subtasks}
        />
      )}

      {hideHeader && (
        <div className="flex items-center gap-1">
          {suggestButton}
          {compactFilters && compactFilterButton}
        </div>
      )}

      {error && (
        <p className="mt-2 text-body-sm text-red-400/80">{error}</p>
      )}

      {jiraWarning && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-body-sm text-amber-300/90">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{jiraWarning}</span>
          <button type="button" onClick={() => setJiraWarning(null)} className="shrink-0 text-amber-400/60 hover:text-amber-300 cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {!collapsed && (
      <>
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
          <p className="mt-3 text-body-lg text-text-muted">No subtasks matching this filter</p>
          {listContent}
        </>
      ) : (
        listContent
      )}

      {pendingDelete && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-overlay-subtle px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">
            Deleted &ldquo;{pendingDelete.sub.title}&rdquo;
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-body-sm font-medium text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease" }}
          >
            <Undo2 size={11} strokeWidth={1.5} />
            Undo
          </button>
        </div>
      )}

      {suggestionsVisible && (
        <SubtaskSuggestions
          suggestions={suggestions}
          isLoading={suggestLoading}
          progressText={suggestProgress}
          error={suggestError}
          addingIndices={addingIndices}
          isExpanded={suggestionsExpanded}
          onToggleExpanded={() => setSuggestionsExpanded((prev) => !prev)}
          onAdd={handleAddSuggestion}
          onAddAll={handleAddAllSuggestions}
          onDismiss={handleDismissSuggestion}
          onRegenerate={() => handleSuggest()}
        />
      )}
      </>
      )}
    </div>
  );
}
