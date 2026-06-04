"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketDetail, JiraStatus, TicketReadiness, Subtask, EpicChild, IssueType } from "@/types/ticket";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tooltip } from "@/components/shared/Tooltip";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueListHeader, type ChildIssueViewMode } from "./ChildIssueListHeader";
import { EpicChildrenBySprint } from "./EpicChildrenBySprint";
import type { StatusFilter } from "./FieldFilterPopover";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { AddToRefinementModal } from "@/components/refinement-session/AddToRefinementModal";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { mapJiraSprints, bulkReviewStories, bulkGenerateSubtasks } from "@/components/sprint-board/sprint-board-utils";
import { tickets, jira, apiFetch, ApiError } from "@/lib/api-client";
import { getJiraUrl } from "@/lib/jira-url";
import { applyLocalMoves, sprintNameForTarget } from "@/lib/epic-children-move";
import { groupChildrenBySprint } from "@/lib/epic-children-grouping";
import { Loader2, ChevronDown, Search, AlertTriangle } from "lucide-react";

const CHILD_ISSUE_TYPES: { value: IssueType; label: string; jiraType: string }[] = [
  { value: "story", label: "Story", jiraType: "Story" },
  { value: "task", label: "Task", jiraType: "Task" },
  { value: "bug", label: "Bug", jiraType: "Bug" },
];

const EPIC_CHILD_FIELDS = [
  { id: "issueKey", label: "issue keys" },
  { id: "assignee", label: "assignees" },
  { id: "status", label: "status" },
  { id: "storyPoints", label: "story points" },
  { id: "businessValue", label: "business value" },
  { id: "sprint", label: "sprint" },
  { id: "subtaskCount", label: "subtask count" },
];

const DEFAULT_VISIBLE = ["issueKey", "status", "storyPoints", "businessValue", "sprint", "subtaskCount"];

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source?: "local" | "jira" | "recent";
}

interface EpicChildrenSectionProps {
  items: TicketDetail["epicChildren"];
  ticketKey: string;
  onMutate: () => void;
  onSelectTicket?: (key: string) => void;
}

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
}

export function EpicChildrenSection({
  items,
  ticketKey,
  onMutate,
  onSelectTicket,
}: EpicChildrenSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [selectedType, setSelectedType] = useState<IssueType>("story");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraWarning, setJiraWarning] = useState<string | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<Subtask[]>([]);
  // Optimistic sprint reassignments (childKey -> new sprint name, or null for backlog),
  // applied to the by-sprint view until the refetched children reflect the move.
  const [localMoves, setLocalMoves] = useState<Record<string, string | null>>({});
  // Optimistic SP/BV edits (childKey -> overridden metrics), applied immediately so
  // the badge appears on click instead of waiting for the refetch round-trip.
  const [localMetrics, setLocalMetrics] = useState<
    Record<string, { storyPoints?: number | null; businessValue?: number | null }>
  >({});
  // Multiselect: checked child keys for the bulk-action toolbar.
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const lastCheckedRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typePickerRef = useRef<HTMLDivElement>(null);

  // Search existing state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchHighlight, setSearchHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { visible: visibleFields, toggleField } = useSectionVisibility("epic-children", DEFAULT_VISIBLE);
  const [viewMode, setViewMode] = useLocalStorage<ChildIssueViewMode>("epic-children-view", "list");
  const { toast, toastLoading, showToast, dismissToast } = useToast();

  const { sprints: rawSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);

  const mergedItems: (EpicChild | Subtask)[] = [
    ...items,
    ...locallyAdded.filter((la) => !items.some((i) => i.key === la.key)),
  ].map((item) => {
    const override = localMetrics[item.key];
    return override ? ({ ...item, ...override } as EpicChild | Subtask) : item;
  });

  const filtered = filter === "all"
    ? mergedItems
    : mergedItems.filter((i) => i.jiraStatus === filter);

  const statusCounts = {
    all: mergedItems.length,
    "TO DO": mergedItems.filter((i) => i.jiraStatus === "TO DO").length,
    "IN PROGRESS": mergedItems.filter((i) => i.jiraStatus === "IN PROGRESS").length,
    DONE: mergedItems.filter((i) => i.jiraStatus === "DONE").length,
  };

  const currentTypeConfig = CHILD_ISSUE_TYPES.find((t) => t.value === selectedType) ?? CHILD_ISSUE_TYPES[0];
  const isFiltered = filter !== "all";

  // --- Create child issue ---

  const handleCreate = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;

    const placeholderKey = `pending-${Date.now()}`;
    const placeholder: Subtask = {
      key: placeholderKey,
      title,
      type: selectedType,
      jiraStatus: "TO DO",
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setNewTitle("");
    setError(null);

    tickets.createChildIssue(ticketKey, { title, issueType: currentTypeConfig.jiraType })
      .then((created) => {
        setLocallyAdded((prev) =>
          prev.map((i) => i.key === placeholderKey ? created : i),
        );
        showToast(`${created.key} created`);
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== placeholderKey));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to create child issue: ${detail}`);
        console.error("Failed to create child issue:", err);
      });
  }, [newTitle, selectedType, ticketKey, currentTypeConfig.jiraType, onMutate, showToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchMode) return;
      handleCreate();
    } else if (e.key === "Escape") {
      if (searchMode) {
        setSearchMode(false);
        setSearchQuery("");
        setSearchResults([]);
      } else {
        setNewTitle("");
        inputRef.current?.blur();
      }
    }
  }, [handleCreate, searchMode]);

  // --- Search existing ---

  const existingKeys = useMemo(() => new Set(mergedItems.map((i) => i.key)), [mergedItems]);

  const doSearch = useCallback((q: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();

    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const { results: data } = await tickets.searchForLink(q, ticketKey, undefined, controller.signal);
        const filtered = data.filter((r: SearchResult) => r.key !== ticketKey && !existingKeys.has(r.key));
        setSearchResults(filtered);
        setSearchHighlight(-1);
        setSearching(false);

        if (filtered.length < 5) {
          setTimeout(async () => {
            try {
              const { results: fullData } = await tickets.searchForLinkWithJira(q, ticketKey, undefined, controller.signal);
              setSearchResults(fullData.filter((r: SearchResult) => r.key !== ticketKey && !existingKeys.has(r.key)));
            } catch { /* ignore aborted */ }
          }, 300);
        }
      } catch {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
  }, [ticketKey, existingKeys]);

  const handleSearchChange = useCallback((value: string) => {
    const urlMatch = value.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const cleaned = urlMatch ? urlMatch[1].toUpperCase() : value;
    setSearchQuery(cleaned);
    setError(null);
    doSearch(cleaned);
  }, [doSearch]);

  const handleLinkExisting = useCallback((result: SearchResult) => {
    const placeholder: Subtask = {
      key: result.key,
      title: result.title,
      type: (result.type || "task") as IssueType,
      jiraStatus: (result.status || "TO DO") as JiraStatus,
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setSearchQuery("");
    setSearchResults([]);
    setSearchMode(false);
    setError(null);

    tickets.updateEpic(result.key, ticketKey)
      .then(() => {
        showToast(`${result.key} linked`);
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== result.key));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to link ${result.key}: ${detail}`);
        console.error("Failed to link existing issue:", err);
      });
  }, [ticketKey, onMutate, showToast]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchHighlight((h) => Math.min(h + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && searchHighlight >= 0 && searchResults[searchHighlight]) {
      e.preventDefault();
      handleLinkExisting(searchResults[searchHighlight]);
    } else if (e.key === "Escape") {
      setSearchQuery("");
      setSearchResults([]);
      setSearchMode(false);
    }
  }, [searchHighlight, searchResults, handleLinkExisting]);

  const closeSearch = useCallback(() => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchHighlight(-1);
  }, []);

  useOutsideClick(searchContainerRef, closeSearch, { enabled: searchMode, escapeClose: false });

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  const handleJiraStatusChange = useCallback(async (childKey: string, status: JiraStatus) => {
    setJiraWarning(null);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(childKey)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJiraWarning(data.error ?? "Failed to update status");
        return;
      }
      if (data.jiraWarning) {
        setJiraWarning(`${childKey}: status updated locally, but Jira sync failed`);
      }
      onMutate();
    } catch (err) {
      console.error("Failed to update status:", err);
      setJiraWarning("Failed to update status");
    }
  }, [onMutate]);

  const handleReadinessChange = useCallback(async (childKey: string, readiness: TicketReadiness | null) => {
    try {
      await tickets.updateMetadata(childKey, { readiness });
      onMutate();
    } catch (err) {
      console.error("Failed to update readiness:", err);
    }
  }, [onMutate]);

  // Drop one optimistic metric override, removing the child entry when empty.
  const revertLocalMetric = useCallback((childKey: string, field: "storyPoints" | "businessValue") => {
    setLocalMetrics((prev) => {
      const entry = prev[childKey];
      if (!entry || !(field in entry)) return prev;
      const next = { ...prev };
      const updated = { ...entry };
      delete updated[field];
      if (Object.keys(updated).length === 0) delete next[childKey];
      else next[childKey] = updated;
      return next;
    });
  }, []);

  const handleStoryPointsChange = useCallback(async (childKey: string, value: number | null) => {
    setJiraWarning(null);
    setLocalMetrics((prev) => ({ ...prev, [childKey]: { ...prev[childKey], storyPoints: value } }));
    try {
      await tickets.updateStoryPoints(childKey, value);
      onMutate();
    } catch (err) {
      console.error("Failed to update story points:", err);
      revertLocalMetric(childKey, "storyPoints");
      setJiraWarning(`Failed to update story points for ${childKey}`);
    }
  }, [onMutate, revertLocalMetric]);

  const handleBusinessValueChange = useCallback(async (childKey: string, value: number | null) => {
    setLocalMetrics((prev) => ({ ...prev, [childKey]: { ...prev[childKey], businessValue: value } }));
    try {
      await tickets.updateMetadata(childKey, { businessValue: value });
      onMutate();
    } catch (err) {
      console.error("Failed to update business value:", err);
      revertLocalMetric(childKey, "businessValue");
      setJiraWarning(`Failed to update business value for ${childKey}`);
    }
  }, [onMutate, revertLocalMetric]);

  // Move a child to another sprint (drag-drop or context menu). Optimistically
  // re-groups the row, then reverts and warns if the Jira round-trip fails.
  const handleMoveChild = useCallback((childKey: string, targetSprintId: string) => {
    const newName = sprintNameForTarget(targetSprintId, sprints);
    setJiraWarning(null);
    setLocalMoves((prev) => ({ ...prev, [childKey]: newName }));
    jira.moveSprint({ issueKeys: [childKey], targetSprintId })
      .then(() => onMutate())
      .catch((err) => {
        setLocalMoves((prev) => {
          const next = { ...prev };
          delete next[childKey];
          return next;
        });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setJiraWarning(`Failed to move ${childKey} to sprint: ${detail}`);
        console.error("Failed to move child to sprint:", err);
      });
  }, [sprints, onMutate]);

  // Drop optimistic overrides once the refetched children confirm the new sprint,
  // so a stale override never masks server truth on later syncs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded reconcile once server confirms the move
    setLocalMoves((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        if (item.key in next) {
          const serverName = isEpicChild(item) ? item.sprintName : null;
          if (serverName === next[item.key]) {
            delete next[item.key];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Drop optimistic SP/BV overrides once the refetched children confirm the value,
  // so a stale override never masks server truth on later syncs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded reconcile once server confirms the edit
    setLocalMetrics((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        const entry = next[item.key];
        if (!entry || !isEpicChild(item)) continue;
        const updated = { ...entry };
        if ("storyPoints" in updated && item.storyPoints === updated.storyPoints) {
          delete updated.storyPoints;
          changed = true;
        }
        if ("businessValue" in updated && item.businessValue === updated.businessValue) {
          delete updated.businessValue;
          changed = true;
        }
        if (Object.keys(updated).length === 0) delete next[item.key];
        else next[item.key] = updated;
      }
      return changed ? next : prev;
    });
  }, [items]);

  // --- Multiselect (bulk actions) ---
  // The visible order differs between views (groups reorder rows), so range-select
  // walks the rendered order of the active view.
  const orderedVisibleKeys = useMemo(() => {
    const base = applyLocalMoves(filtered, localMoves).filter((i) => !i.key.startsWith("pending-"));
    if (viewMode === "sprint") {
      return groupChildrenBySprint(base, sprints).flatMap((g) => g.items.map((i) => i.key));
    }
    return base.map((i) => i.key);
  }, [filtered, localMoves, viewMode, sprints]);

  const someChecked = checkedKeys.size > 0;
  const allChecked = orderedVisibleKeys.length > 0 && orderedVisibleKeys.every((k) => checkedKeys.has(k));

  const handleCheckboxClick = useCallback((key: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastCheckedRef.current) {
      const a = orderedVisibleKeys.indexOf(lastCheckedRef.current);
      const b = orderedVisibleKeys.indexOf(key);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = orderedVisibleKeys.slice(lo, hi + 1);
        setCheckedKeys((prev) => { const next = new Set(prev); range.forEach((k) => next.add(k)); return next; });
        lastCheckedRef.current = key;
        return;
      }
    }
    setCheckedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    lastCheckedRef.current = key;
  }, [orderedVisibleKeys]);

  const toggleAll = useCallback(() => {
    setCheckedKeys(allChecked ? new Set() : new Set(orderedVisibleKeys));
  }, [allChecked, orderedVisibleKeys]);

  const clearSelection = useCallback(() => {
    setCheckedKeys(new Set());
    lastCheckedRef.current = null;
  }, []);

  const checkedItems = mergedItems.filter((i) => checkedKeys.has(i.key));
  const selectedPoints = checkedItems.reduce((s, i) => s + (isEpicChild(i) ? (i.storyPoints ?? 0) : 0), 0);
  const selectedBV = checkedItems.reduce((s, i) => s + (isEpicChild(i) ? (i.businessValue ?? 0) : 0), 0);

  // Runs an async op per checked key, refetches, and reports a single toast.
  const runBulk = useCallback(async (verb: string, fn: (key: string) => Promise<unknown>) => {
    const keys = [...checkedKeys];
    if (keys.length === 0) return;
    const results = await Promise.allSettled(keys.map(fn));
    onMutate();
    const failed = results.filter((r) => r.status === "rejected").length;
    showToast(failed
      ? `Failed for ${failed} issue${failed === 1 ? "" : "s"}${failed < keys.length ? ` (${keys.length - failed} updated)` : ""}`
      : `${verb} ${keys.length} issue${keys.length === 1 ? "" : "s"}`);
  }, [checkedKeys, onMutate, showToast]);

  const handleBulkStatus = useCallback((status: JiraStatus) =>
    runBulk("Status set for", (k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}/status`, { method: "PUT", body: { status } })),
    [runBulk]);

  const handleBulkReadiness = useCallback((readiness: TicketReadiness | null) =>
    runBulk("Readiness set for", (k) => tickets.updateMetadata(k, { readiness })),
    [runBulk]);

  const handleBulkEpic = useCallback((epicKey: string | null) =>
    runBulk("Epic updated for", (k) => tickets.updateEpic(k, epicKey)),
    [runBulk]);

  const handleBulkAssignee = useCallback((accountId: string | null, name: string | null) =>
    runBulk("Assignee updated for", (k) => jira.assign({ issueKey: k, accountId, name })),
    [runBulk]);

  const handleBulkFlag = useCallback((flagged: boolean) =>
    runBulk(flagged ? "Flagged" : "Unflagged", (k) => tickets.toggleFlag(k, flagged)),
    [runBulk]);

  const handleBulkLabels = useCallback((labels: string[], mode: "add" | "set") =>
    runBulk("Labels updated for", async (k) => {
      let finalLabels = labels;
      if (mode === "add") {
        const detail = await tickets.get(k);
        finalLabels = [...new Set([...(detail.labels ?? []), ...labels])];
      }
      return tickets.updateLabels(k, finalLabels);
    }),
    [runBulk]);

  // Sprint moves go through one bulk call with optimistic re-grouping for every key.
  const handleBulkMoveSprint = useCallback((targetSprintId: string) => {
    const keys = [...checkedKeys];
    if (keys.length === 0) return;
    const newName = sprintNameForTarget(targetSprintId, sprints);
    setJiraWarning(null);
    setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = newName; }); return next; });
    jira.moveSprint({ issueKeys: keys, targetSprintId })
      .then(() => { onMutate(); showToast(`Moved ${keys.length} issue${keys.length === 1 ? "" : "s"} to sprint`); })
      .catch((err) => {
        setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => delete next[k]); return next; });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setJiraWarning(`Failed to move ${keys.length} issue${keys.length === 1 ? "" : "s"} to sprint: ${detail}`);
      });
  }, [checkedKeys, sprints, onMutate, showToast]);

  const handleBulkReview = useCallback(async () => {
    const keys = [...checkedKeys];
    if (!keys.length) return;
    showToast(`Reviewing ${keys.length} issue${keys.length === 1 ? "" : "s"}...`);
    await bulkReviewStories(keys);
    onMutate();
    showToast(`Reviewed ${keys.length} issue${keys.length === 1 ? "" : "s"}`);
  }, [checkedKeys, onMutate, showToast]);

  const handleBulkGenerate = useCallback(async () => {
    const keys = [...checkedKeys];
    if (!keys.length) return;
    setBulkGenerating(true);
    showToast(`Generating subtasks for ${keys.length} issue${keys.length === 1 ? "" : "s"}...`);
    try {
      const { succeeded, failed } = await bulkGenerateSubtasks(keys);
      showToast(failed ? `Generated for ${succeeded}, ${failed} failed` : `Subtask suggestions sent for ${succeeded} issue${succeeded === 1 ? "" : "s"}`);
      onMutate();
    } finally {
      setBulkGenerating(false);
    }
  }, [checkedKeys, onMutate, showToast]);

  const handleCopySelected = useCallback(() => {
    const sel = mergedItems.filter((i) => checkedKeys.has(i.key));
    if (!sel.length) return;
    navigator.clipboard.writeText(sel.map((i) => `${i.title} - ${getJiraUrl(i.key)}`).join("\n"))
      .then(() => showToast(`Copied ${sel.length} issue${sel.length === 1 ? "" : "s"} to clipboard`))
      .catch(() => showToast("Failed to copy to clipboard"));
  }, [mergedItems, checkedKeys, showToast]);

  // --- Render metadata slot for a child issue ---
  // hideSprint drops the sprint pill where the surrounding group already names the
  // sprint (the by-sprint view), avoiding a redundant per-row badge.
  function renderMetadata(child: EpicChild | Subtask, hideSprint = false) {
    const epic = isEpicChild(child) ? child : null;
    return (
      <>
        {visibleFields.has("storyPoints") && epic && (
          <span
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <StoryPointPicker
              value={epic.storyPoints}
              onChange={(v) => handleStoryPointsChange(child.key, v)}
              showMetricIcon
              richTooltip
              revealWhenEmpty
              revealGroup="row"
            />
          </span>
        )}
        {visibleFields.has("businessValue") && epic && (
          <span
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <BusinessValuePicker
              value={epic.businessValue}
              onChange={(v) => handleBusinessValueChange(child.key, v)}
              showMetricIcon
              richTooltip
              revealWhenEmpty
              revealGroup="row"
            />
          </span>
        )}
        {visibleFields.has("subtaskCount") && epic && epic.subtaskCount > 0 && (
          <Tooltip content={`${epic.subtaskCount} subtask${epic.subtaskCount === 1 ? "" : "s"}`}>
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-muted">
              <IssueTypeIcon type="subtask" size={10} />
              {epic.subtaskCount}
            </span>
          </Tooltip>
        )}
        {!hideSprint && visibleFields.has("sprint") && epic?.sprintName && (
          <Tooltip content={epic.sprintName}>
            <span className="shrink-0 max-w-[100px] truncate rounded-md bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {epic.sprintName}
            </span>
          </Tooltip>
        )}
        {visibleFields.has("assignee") && <Avatar assignee={child.assignee} size={22} />}
      </>
    );
  }

  const childRows = filtered.map((child, idx) => {
    const epic = isEpicChild(child) ? child : null;
    return (
      <ChildIssueRow
        key={child.key}
        item={child}
        isLast={idx === filtered.length - 1}
        isPending={child.key.startsWith("pending-")}
        showTypeIcon
        showKey={visibleFields.has("issueKey")}
        showStatus={visibleFields.has("status")}
        readiness={epic?.readiness}
        onJiraStatusChange={(s) => handleJiraStatusChange(child.key, s)}
        onReadinessChange={(r) => handleReadinessChange(child.key, r)}
        onSelect={onSelectTicket}
        selectable
        isChecked={checkedKeys.has(child.key)}
        someChecked={someChecked}
        onCheckboxClick={(e) => handleCheckboxClick(child.key, e)}
        metadataSlot={renderMetadata(child)}
      />
    );
  });

  // Inline input row (create or search mode)
  const inlineInput = (
    <div
      ref={searchMode ? searchContainerRef : undefined}
      className={`relative flex items-center gap-3 px-3 py-2 ${viewMode === "list" && filtered.length > 0 ? "border-t border-border-subtle" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {searchMode ? (
        <>
          <Search size={14} className="shrink-0 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by key or title..."
            className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
          />
          {searching && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
          <button
            type="button"
            onClick={closeSearch}
            className="cursor-pointer text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <IssueTypeIcon type={selectedType} size={14} />
          <div className="relative" ref={typePickerRef}>
            <button
              type="button"
              onClick={() => setShowTypePicker((v) => !v)}
              className="flex cursor-pointer items-center gap-1 rounded py-0.5 text-text-muted transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={visibleFields.has("issueKey") ? { minWidth: 69 } : undefined}
            >
              <span className="text-body-sm font-medium text-text-muted">{currentTypeConfig.label}</span>
              <ChevronDown size={10} className="text-text-muted" />
            </button>
            {showTypePicker && (
              <div className="absolute top-full left-0 z-20 mt-1 overflow-hidden rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_4px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
                {CHILD_ISSUE_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(opt.value);
                      setShowTypePicker(false);
                      inputRef.current?.focus();
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-body-lg transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                      opt.value === selectedType ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    <IssueTypeIcon type={opt.value} size={14} />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowTypePicker(false)}
            placeholder="Create child issue..."
            className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
          />

          <button
            type="button"
            onClick={() => setSearchMode(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-text-muted transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Link existing issue"
          >
            <Search size={12} strokeWidth={1.5} />
            <span className="hidden text-body-sm font-medium sm:inline">Link existing</span>
          </button>
        </>
      )}

      {searchMode && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_4px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
          {searchResults.map((r, idx) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleLinkExisting(r)}
              className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                idx === searchHighlight ? "bg-overlay-subtle" : ""
              } ${idx < searchResults.length - 1 ? "border-b border-border-subtle" : ""}`}
            >
              <IssueTypeIcon type={(r.type || "task") as IssueType} size={14} />
              <span className="font-mono text-body-sm text-[var(--color-brand-400)]">{r.key}</span>
              <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">{r.title}</span>
              <StatusBadge status={(r.status || "TO DO") as JiraStatus} />
              {r.source === "jira" && (
                <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">Jira</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const listContent = (
    <div className="mt-3">
      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg rounded-b-none border border-b-0 border-border-default">
          {childRows}
        </div>
      )}
      <div className={`rounded-lg border border-border-default ${filtered.length > 0 ? "rounded-t-none border-t-0" : ""}`}>
        {inlineInput}
      </div>
    </div>
  );

  const sprintContent = (
    <div className="mt-3 flex flex-col gap-3">
      <EpicChildrenBySprint
        items={applyLocalMoves(filtered, localMoves)}
        sprints={sprints}
        ticketKey={ticketKey}
        visibleFields={visibleFields}
        renderMetadata={renderMetadata}
        onJiraStatusChange={handleJiraStatusChange}
        onReadinessChange={handleReadinessChange}
        onSelect={onSelectTicket}
        onMoveChild={handleMoveChild}
        onMoveError={setJiraWarning}
        checkedKeys={checkedKeys}
        someChecked={someChecked}
        onCheckboxClick={handleCheckboxClick}
      />
      <div className="overflow-hidden rounded-lg border border-border-default">
        {inlineInput}
      </div>
    </div>
  );

  const content = viewMode === "sprint" ? sprintContent : listContent;

  return (
    <div className="mt-8">
      <ChildIssueListHeader
        title="Child Issues"
        totalCount={mergedItems.length}
        filteredCount={filtered.length}
        isFiltered={isFiltered}
        filter={filter}
        setFilter={setFilter}
        statusCounts={statusCounts}
        fields={EPIC_CHILD_FIELDS}
        visibleFields={visibleFields}
        onToggleField={(id, show) => toggleField(id, show)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

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

      {filtered.length > 0 ? (
        content
      ) : mergedItems.length > 0 ? (
        <>
          <p className="mt-3 text-body-lg text-text-muted">No child issues matching this filter</p>
          {content}
        </>
      ) : (
        content
      )}

      {someChecked && (
        <BulkActionBar
          count={checkedKeys.size}
          totalCount={orderedVisibleKeys.length}
          selectedPoints={selectedPoints}
          selectedBV={selectedBV}
          allChecked={allChecked}
          onToggleAll={toggleAll}
          onClear={clearSelection}
          onSetStatus={handleBulkStatus}
          onSetReadiness={handleBulkReadiness}
          onSetEpic={handleBulkEpic}
          onMoveSprint={handleBulkMoveSprint}
          onUpdateAssignee={handleBulkAssignee}
          onUpdateLabel={handleBulkLabels}
          onSetFlagged={handleBulkFlag}
          flagState="mixed"
          sprints={sprints}
          onReviewStory={handleBulkReview}
          onGenerateSubtasks={handleBulkGenerate}
          isGeneratingSubtasks={bulkGenerating}
          onCopyToClipboard={handleCopySelected}
          onRefine={() => setRefineModalOpen(true)}
        />
      )}

      <AddToRefinementModal
        open={refineModalOpen}
        onClose={() => setRefineModalOpen(false)}
        ticketKeys={[...checkedKeys]}
        onAdded={(_id, name) => showToast(`Added ${checkedKeys.size} issue${checkedKeys.size === 1 ? "" : "s"} to "${name}"`)}
      />

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
  );
}
