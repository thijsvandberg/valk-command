"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { TicketDetail, JiraStatus, Subtask, IssueType } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets, ApiError } from "@/lib/api-client";
import { Loader2, ChevronDown, Search } from "lucide-react";

type StatusFilter = "all" | JiraStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TO DO", label: "To Do" },
  { value: "IN PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

const CHILD_ISSUE_TYPES: { value: IssueType; label: string; jiraType: string }[] = [
  { value: "story", label: "Story", jiraType: "Story" },
  { value: "task", label: "Task", jiraType: "Task" },
  { value: "bug", label: "Bug", jiraType: "Bug" },
];

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source?: "local" | "jira";
}

interface EpicChildrenSectionProps {
  items: TicketDetail["epicChildren"];
  ticketKey: string;
  onMutate: () => void;
  onSelectTicket?: (key: string) => void;
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

  const mergedItems = [
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
      handleCreate();
    } else if (e.key === "Escape") {
      setNewTitle("");
      inputRef.current?.blur();
    }
  }, [handleCreate]);

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
        const data = await tickets.searchForLink(q, ticketKey, controller.signal);
        const filtered = data.filter((r: SearchResult) => r.key !== ticketKey && !existingKeys.has(r.key));
        setSearchResults(filtered);
        setSearchHighlight(-1);
        setSearching(false);

        if (filtered.length < 5) {
          setTimeout(async () => {
            try {
              const fullData = await tickets.searchForLinkWithJira(q, ticketKey, controller.signal);
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
    const placeholderKey = `pending-${Date.now()}`;
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

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchMode) return;
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchMode, closeSearch]);

  // Focus search input when entering search mode
  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  // --- Render ---

  const childRows = filtered.map((child, idx) => {
    const isPending = child.key.startsWith("pending-");
    return (
      <div
        key={child.key}
        className={`flex items-center gap-3 px-3 py-2.5 ${
          onSelectTicket && !isPending ? "cursor-pointer hover:bg-overlay-subtle" : ""
        } ${idx < filtered.length - 1 ? "border-b border-border-subtle" : ""} ${
          isPending ? "opacity-50" : ""
        }`}
        onClick={!isPending && onSelectTicket ? (e) => {
          if (e.metaKey || e.ctrlKey) {
            window.open(`/tickets/${child.key}`, "_blank");
            return;
          }
          onSelectTicket(child.key);
        } : undefined}
      >
        <IssueTypeIcon type={child.type} size={14} />
        {isPending ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" />
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--color-brand-400)]">
            {child.key}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{child.title}</span>
        <StatusBadge status={child.jiraStatus} />
        <Avatar assignee={child.assignee} size={22} />
      </div>
    );
  });

  const inlineInput = (
    <div
      className="flex items-center gap-2 px-3 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Type selector */}
      <div className="relative" ref={typePickerRef}>
        <button
          type="button"
          onClick={() => setShowTypePicker((v) => !v)}
          className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-text-muted transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80"
        >
          <IssueTypeIcon type={selectedType} size={14} />
          <span className="text-xs font-medium text-text-muted">{currentTypeConfig.label}</span>
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
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
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
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
      />
    </div>
  );

  const searchRow = searchMode ? (
    <div
      ref={searchContainerRef}
      className="relative border-t border-border-subtle px-3 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-text-muted" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search by key or title..."
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        {searching && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
        <button
          type="button"
          onClick={closeSearch}
          className="cursor-pointer text-xs text-text-muted transition-colors duration-150 hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
      {searchResults.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_4px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
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
              <span className="font-mono text-xs text-[var(--color-brand-400)]">{r.key}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{r.title}</span>
              <StatusBadge status={(r.status || "TO DO") as JiraStatus} />
              {r.source === "jira" && (
                <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">Jira</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="border-t border-border-subtle px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setSearchMode(true)}
        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--color-brand-400)] transition-colors duration-150 hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-80"
      >
        <Search size={12} />
        Choose existing
      </button>
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
        {searchRow}
      </div>
    </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Child Issues"
        count={filter === "all" ? mergedItems.length : undefined}
        countLabel={filter !== "all" && mergedItems.length > 0 ? `${filtered.length} of ${mergedItems.length}` : undefined}
      />

      {/* Status filter chips */}
      {mergedItems.length > 0 && (
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

      {/* Child list + inline input + search */}
      {filtered.length > 0 ? (
        listContent
      ) : mergedItems.length > 0 ? (
        <>
          <p className="mt-3 text-sm text-text-muted">No child issues matching this filter</p>
          {listContent}
        </>
      ) : (
        listContent
      )}
    </div>
  );
}
