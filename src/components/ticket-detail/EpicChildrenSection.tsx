"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketDetail, JiraStatus, TicketReadiness, Subtask, EpicChild, IssueType } from "@/types/ticket";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tooltip } from "@/components/shared/Tooltip";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueListHeader } from "./ChildIssueListHeader";
import type { StatusFilter } from "./FieldFilterPopover";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { tickets, ApiError } from "@/lib/api-client";
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
  { id: "sprint", label: "sprint" },
  { id: "subtaskCount", label: "subtask count" },
];

const DEFAULT_VISIBLE = ["issueKey", "status", "storyPoints", "sprint", "subtaskCount"];

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

  const mergedItems: (EpicChild | Subtask)[] = [
    ...items,
    ...locallyAdded.filter((la) => !items.some((i) => i.key === la.key)),
  ];

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
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== placeholderKey));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to create child issue: ${detail}`);
        console.error("Failed to create child issue:", err);
      });
  }, [newTitle, selectedType, ticketKey, currentTypeConfig.jiraType, onMutate]);

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
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== result.key));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to link ${result.key}: ${detail}`);
        console.error("Failed to link existing issue:", err);
      });
  }, [ticketKey, onMutate]);

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

  // --- Render metadata slot for a child issue ---
  function renderMetadata(child: EpicChild | Subtask) {
    const epic = isEpicChild(child) ? child : null;
    return (
      <>
        {visibleFields.has("storyPoints") && epic?.storyPoints != null && (
          <span className="shrink-0"><MetricBadge metric="sp" value={epic.storyPoints} tinted size="xs" /></span>
        )}
        {visibleFields.has("subtaskCount") && epic && epic.subtaskCount > 0 && (
          <Tooltip content={`${epic.subtaskCount} subtask${epic.subtaskCount === 1 ? "" : "s"}`}>
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-muted">
              <IssueTypeIcon type="subtask" size={10} />
              {epic.subtaskCount}
            </span>
          </Tooltip>
        )}
        {visibleFields.has("sprint") && epic?.sprintName && (
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
        metadataSlot={renderMetadata(child)}
      />
    );
  });

  // Inline input row (create or search mode)
  const inlineInput = (
    <div
      ref={searchMode ? searchContainerRef : undefined}
      className={`relative flex items-center gap-3 px-3 py-2 ${filtered.length > 0 ? "border-t border-border-subtle" : ""}`}
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
        listContent
      ) : mergedItems.length > 0 ? (
        <>
          <p className="mt-3 text-body-lg text-text-muted">No child issues matching this filter</p>
          {listContent}
        </>
      ) : (
        listContent
      )}
    </div>
  );
}
