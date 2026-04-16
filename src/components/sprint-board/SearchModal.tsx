"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, PanelRight, PanelRightClose, ListFilter, Clock, Bookmark, BookmarkCheck, Trash2, Check } from "lucide-react";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { Button } from "@/components/ui/Button";

import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";
import type { SearchMode, FocusedPanel } from "@/components/sprint-board/SearchResultParts";
import {
  PreviewPane,
  SkeletonRow,
  LocalResultRow,
  JiraResultRow,
  EmptyState,
  GroupedResultSection,
  ConversationResultRow,
  CommentResultRow,
} from "@/components/sprint-board/SearchResultParts";
import {
  SearchFilterPanel,
  EMPTY_FILTERS,
  hasActiveFilters,
  filtersToParams,
  serializeFilters,
  type SearchFilters,
  type FilterOptionsData,
  type SectionCounts,
} from "@/components/sprint-board/SearchFilterPanel";

const TICKET_SECTION_LIMIT = 10;
const SECTION_LIMIT = 5;

interface GroupedResults {
  tickets: LocalSearchResult[];
  conversations: ConversationSearchResult[];
  comments: CommentSearchResult[];
}

// A flattened navigable row (sections headers and show-more buttons are not rows)
type VisibleRow =
  | { group: "tickets"; item: LocalSearchResult }
  | { group: "conversations"; item: ConversationSearchResult }
  | { group: "comments"; item: CommentSearchResult };

function parseJiraKeyFromInput(input: string): string | null {
  const trimmed = input.trim();
  // Match /browse/VPL-44481 path segment
  const browseMatch = trimmed.match(/\/browse\/([A-Za-z]+-\d+)/);
  if (browseMatch) return browseMatch[1].toUpperCase();
  // Match ?selectedIssue=VPL-44481 or &selectedIssue=VPL-44481 query param
  const selectedIssueMatch = trimmed.match(/[?&]selectedIssue=([A-Za-z]+-\d+)/);
  if (selectedIssueMatch) return selectedIssueMatch[1].toUpperCase();
  // Match standalone key: VPL-44481 (no other text)
  const keyMatch = trimmed.match(/^([A-Za-z]+-\d+)$/);
  if (keyMatch) return keyMatch[1].toUpperCase();
  return null;
}

interface SearchModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSelectTicket: (key: string) => void;
  sprintNameMap?: Record<string, string>;
}

export function SearchModal({ open, initialQuery = "", onClose, onSelectTicket, sprintNameMap }: SearchModalProps) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>("local");
  const [groupedResults, setGroupedResults] = useState<GroupedResults>({ tickets: [], conversations: [], comments: [] });
  const [jiraResults, setJiraResults] = useState<JiraSearchResult[]>([]);
  const [jiraQuery, setJiraQuery] = useState("");
  const [jiraJql, setJiraJql] = useState("");
  const [showJqlOverride, setShowJqlOverride] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingJira, setLoadingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(520);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>("list");
  const [fetchingKey, setFetchingKey] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsData | null>(null);
  // Per-section collapse/expand state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Per-section "show all" state (expand beyond SECTION_LIMIT)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [savingSearch, setSavingSearch] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const filterOptionsFetchedRef = useRef(false);
  const { history: searchHistory, addSearch, clearHistory } = useSearchHistory();
  const { savedSearches, saveSearch, deleteSearch, isFull } = useSavedSearches();

  const inputRef = useRef<HTMLInputElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(520);

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = previewWidth;
    e.preventDefault();
  }, [previewWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - e.clientX;
      setPreviewWidth(Math.max(260, Math.min(720, dragStartWidthRef.current + delta)));
    }
    function onMouseUp() { isDraggingRef.current = false; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!previewEnabled || activeIdx < 0) setFocusedPanel("list");
  }, [previewEnabled, activeIdx]);

  useEffect(() => {
    if (open) {
      if (initialQuery) {
        setQuery(initialQuery);
        setGroupedResults({ tickets: [], conversations: [], comments: [] });
        setJiraResults([]);
        setJiraError(null);
        setActiveIdx(-1);
        setFocusedPanel("list");
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // Reset filter and section state when modal closes
      setShowFilters(false);
      setFilters(EMPTY_FILTERS);
      setCollapsedSections(new Set());
      setExpandedSections(new Set());
      setSavingSearch(false);
      setSaveLabel("");
    }
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onClose]);

  // Detect Jira key or URL in the active search input (computed early so hooks below can use it)
  const activeInputValue = mode === "local" ? query : (jiraQuery || query);
  const detectedKey = parseJiraKeyFromInput(activeInputValue);
  // When a URL is pasted, search by just the key so the local index can match it
  const effectiveLocalQuery = detectedKey ?? query;

  const runLocalSearch = useCallback(async (q: string, activeFilters: SearchFilters) => {
    if (q.trim().length < 2) { setGroupedResults({ tickets: [], conversations: [], comments: [] }); return; }
    if (localAbortRef.current) localAbortRef.current.abort();
    localAbortRef.current = new AbortController();
    const { signal } = localAbortRef.current;
    setLoadingLocal(true);
    try {
      const params = new URLSearchParams({ q });
      for (const [k, v] of filtersToParams(activeFilters).entries()) params.set(k, v);
      const res = await fetch(`/api/search/local?${params.toString()}`, { signal });
      if (res.ok) {
        const data = await res.json();
        // Support both grouped response (new) and flat results (legacy/backward compat)
        if (data.groups) {
          setGroupedResults({
            tickets: data.groups.tickets ?? [],
            conversations: data.groups.conversations ?? [],
            comments: data.groups.comments ?? [],
          });
        } else {
          setGroupedResults({ tickets: data.results ?? [], conversations: [], comments: [] });
        }
        setActiveIdx(-1);
        // Reset section expansion when results change
        setExpandedSections(new Set());
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    if (!open || mode !== "local") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLocalSearch(effectiveLocalQuery, filters), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [effectiveLocalQuery, filters, mode, open, runLocalSearch]);

  const runJiraSearch = useCallback(async () => {
    const q = jiraQuery.trim() || query.trim();
    const jqlOverride = jiraJql.trim();
    if (!q && !jqlOverride) return;
    setLoadingJira(true);
    setJiraError(null);
    setJiraResults([]);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (jqlOverride) params.set("jql", jqlOverride);
      const res = await fetch(`/api/search/jira?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setJiraResults(data.issues ?? []);
        setActiveIdx(-1);
      } else {
        const data = await res.json().catch(() => ({}));
        setJiraError(data.error ?? "Search failed");
      }
    } catch {
      setJiraError("Network error — check Jira connectivity");
    } finally {
      setLoadingJira(false);
    }
  }, [query, jiraQuery, jiraJql]);

  const openFilters = useCallback(async () => {
    setShowFilters((v) => !v);
    if (!filterOptionsFetchedRef.current) {
      filterOptionsFetchedRef.current = true;
      try {
        const res = await fetch("/api/search/local/filter-options");
        if (res.ok) {
          const data = await res.json();
          setFilterOptions(data);
        }
      } catch {
        // Non-critical: dropdowns will show empty options
      }
    }
  }, []);

  const navigateToKey = useCallback(async (key: string, newTab: boolean) => {
    const existsLocally = groupedResults.tickets.some((r) => r.key === key);
    if (!existsLocally) {
      setFetchingKey(true);
      try {
        await fetch("/api/jira/sync-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketKeys: [key] }),
        });
      } catch {
        // Navigate anyway even if the fetch failed
      } finally {
        setFetchingKey(false);
      }
    }
    if (newTab) {
      window.open(`/tickets/${key}`, "_blank", "noopener,noreferrer");
      window.focus();
    } else {
      router.push(`/tickets/${key}`);
      onClose();
    }
  }, [groupedResults.tickets, router, onClose]);

  // Build a flat array of all visible rows across all non-collapsed/filtered sections, respecting limits
  const visibleRows = useMemo<VisibleRow[]>(() => {
    if (mode !== "local") return [];

    const rows: VisibleRow[] = [];

    const addGroup = <T extends LocalSearchResult | ConversationSearchResult | CommentSearchResult>(
      groupKey: "tickets" | "conversations" | "comments",
      items: T[],
    ) => {
      if (items.length === 0) return;
      // Skip section if a section filter is active and this section is not selected
      if (filters.sections.size > 0 && !filters.sections.has(groupKey)) return;
      if (collapsedSections.has(groupKey)) return;
      const defaultLimit = groupKey === "tickets" ? TICKET_SECTION_LIMIT : SECTION_LIMIT;
      const limit = expandedSections.has(groupKey) ? items.length : defaultLimit;
      for (const item of items.slice(0, limit)) {
        rows.push({ group: groupKey, item } as VisibleRow);
      }
    };

    addGroup("tickets", groupedResults.tickets);
    addGroup("conversations", groupedResults.conversations);
    addGroup("comments", groupedResults.comments);

    return rows;
  }, [mode, groupedResults, collapsedSections, expandedSections, filters.sections]);

  const totalGroupedCount = groupedResults.tickets.length + groupedResults.conversations.length + groupedResults.comments.length;

  const jiraResultCount = jiraResults.length;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (focusedPanel === "preview") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        previewPaneRef.current?.scrollBy({ top: 80, behavior: "smooth" });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        previewPaneRef.current?.scrollBy({ top: -80, behavior: "smooth" });
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedPanel("list");
        inputRef.current?.focus();
        return;
      }
      return;
    }

    if (mode === "local") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIdx + 1, visibleRows.length - 1);
        setActiveIdx(next);
        if (next >= 0) setPreviewEnabled(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(activeIdx - 1, 0);
        setActiveIdx(next);
        if (next >= 0) setPreviewEnabled(true);
        return;
      }
      if (e.key === "ArrowRight" && previewEnabled && activeIdx >= 0) {
        const row = visibleRows[activeIdx];
        // Preview pane only for ticket results
        if (row?.group === "tickets") {
          e.preventDefault();
          setFocusedPanel("preview");
          return;
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (detectedKey) {
          navigateToKey(detectedKey, e.shiftKey);
          return;
        }
        const row = visibleRows[activeIdx];
        if (!row) return;
        addSearch(effectiveLocalQuery);
        if (row.group === "tickets") {
          const result = row.item as LocalSearchResult;
          if (e.shiftKey) {
            window.open(`/tickets/${result.key}`, "_blank", "noopener,noreferrer");
            window.focus();
          } else {
            router.push(`/tickets/${result.key}`);
            onClose();
          }
        } else if (row.group === "conversations") {
          const conv = row.item as ConversationSearchResult;
          if (e.shiftKey) {
            window.open(`/chat/${conv.id}`, "_blank", "noopener,noreferrer");
            window.focus();
          } else {
            router.push(`/chat/${conv.id}`);
            onClose();
          }
        } else if (row.group === "comments") {
          const comment = row.item as CommentSearchResult;
          if (e.shiftKey) {
            window.open(`/tickets/${comment.ticketKey}`, "_blank", "noopener,noreferrer");
            window.focus();
          } else {
            router.push(`/tickets/${comment.ticketKey}`);
            onClose();
          }
        }
        return;
      }
    } else {
      // Jira mode
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, jiraResultCount - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (detectedKey) {
          navigateToKey(detectedKey, e.shiftKey);
          return;
        }
        if (loadingJira) return;
        if (jiraResults.length > 0) {
          const issue = jiraResults[activeIdx];
          if (issue) {
            addSearch(jiraQuery || query);
            router.push(`/tickets/${issue.key}`);
            onClose();
          }
        } else {
          runJiraSearch();
        }
      }
    }
  }, [focusedPanel, activeIdx, mode, visibleRows, jiraResults, jiraResultCount, previewEnabled, loadingJira, detectedKey, navigateToKey, onClose, runJiraSearch, router, addSearch, effectiveLocalQuery, jiraQuery, query]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[data-result-row]");
    const row = rows[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx]);

  // Which ticket result is active (for preview pane — only tickets have preview)
  const activeTicketResult = useMemo(() => {
    if (!previewEnabled || activeIdx < 0) return null;
    const row = visibleRows[activeIdx];
    if (row?.group === "tickets") return row.item as LocalSearchResult;
    return null;
  }, [previewEnabled, activeIdx, visibleRows]);

  const switchToJira = useCallback(() => {
    const q = query.trim();
    setMode("jira");
    setActiveIdx(-1);
    if (q) {
      setJiraQuery(q);
      // Defer to let state update settle before triggering search
      setTimeout(() => runJiraSearch(), 0);
    }
  }, [query, runJiraSearch]);

  const handleSaveConfirm = useCallback(() => {
    const label = saveLabel.trim();
    if (label) saveSearch(label, query.trim(), filters);
    setSavingSearch(false);
    setSaveLabel("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [saveLabel, saveSearch, query, filters]);

  const handleSaveOpen = useCallback(() => {
    setSaveLabel(query.trim());
    setSavingSearch(true);
    requestAnimationFrame(() => saveInputRef.current?.focus());
  }, [query]);

  const handleSaveCancel = useCallback(() => {
    setSavingSearch(false);
    setSaveLabel("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  if (!open) return null;

  const displayQuery = mode === "local" ? query : (jiraQuery || query);
  const showLocalSkeleton = loadingLocal && mode === "local";
  const showJiraSkeleton = loadingJira && mode === "jira";
  const showPreview = previewEnabled && mode === "local" && activeTicketResult !== null;
  const activeResult = activeTicketResult;

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showMoreSection = (key: string) => {
    setExpandedSections((prev) => new Set(prev).add(key));
  };

  const sectionVisible = (key: string) =>
    filters.sections.size === 0 || filters.sections.has(key);

  // Show history panel when query is short, history exists, and we're in local mode
  const showHistory = mode === "local" && query.trim().length < 2 && searchHistory.length > 0;
  const showSavedSearches = mode === "local" && query.trim().length < 2 && savedSearches.length > 0;

  // Whether the current query+filters combination is already saved
  const isCurrentSearchSaved =
    mode === "local" &&
    query.trim().length >= 2 &&
    savedSearches.some(
      (s) =>
        s.query === query.trim() &&
        JSON.stringify(serializeFilters(s.filters)) === JSON.stringify(serializeFilters(filters)),
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none absolute inset-0 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-[1200px] overflow-hidden rounded-xl"
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
          animation: "searchModalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-white/35" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={mode === "local" ? query : (jiraQuery || query)}
            onChange={(e) => {
              if (mode === "local") setQuery(e.target.value);
              else setJiraQuery(e.target.value);
            }}
            placeholder={mode === "local" ? "Search tickets..." : "Search Jira..."}
            className="flex-1 bg-transparent text-[15px] text-white/90 placeholder-white/25 focus:outline-none"
          />
          <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
            <button
              type="button"
              onClick={() => { setMode("local"); setActiveIdx(-1); }}
              className="rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
              style={{
                backgroundColor: mode === "local" ? "var(--color-brand-500)" : "transparent",
                color: mode === "local" ? "#fff" : "rgba(255,255,255,0.4)",
                transition: "background-color 100ms, color 100ms",
              }}
            >
              Local
            </button>
            <button
              type="button"
              onClick={() => { setMode("jira"); setActiveIdx(-1); }}
              className="rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
              style={{
                backgroundColor: mode === "jira" ? "var(--color-brand-500)" : "transparent",
                color: mode === "jira" ? "#fff" : "rgba(255,255,255,0.4)",
                transition: "background-color 100ms, color 100ms",
              }}
            >
              Jira
            </button>
          </div>

          {/* Filter toggle — local mode only */}
          {mode === "local" && (
            <div className="relative">
              <button
                type="button"
                onClick={openFilters}
                aria-label="Toggle filters"
                className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                style={{
                  backgroundColor: showFilters
                    ? "rgba(74, 170, 96, 0.12)"
                    : "rgba(255,255,255,0.04)",
                  color: showFilters ? "var(--color-brand-400)" : "rgba(255,255,255,0.4)",
                  transition: "background-color 120ms, color 120ms",
                }}
              >
                <ListFilter className="h-4 w-4" strokeWidth={1.5} />
              </button>
              {/* Active-filter indicator dot */}
              {hasActiveFilters(filters) && (
                <span
                  className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: "var(--color-brand-500)" }}
                />
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={<X className="h-4 w-4" strokeWidth={1.5} />}
            onClick={onClose}
          />
        </div>

        {mode === "jira" && (
          <div className="border-b border-white/[0.06] px-6 py-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowJqlOverride((v) => !v)}
              className="text-xs text-white/30 hover:text-white/50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            >
              {showJqlOverride ? "Hide JQL" : "JQL override"}
            </button>
            {showJqlOverride && (
              <input
                type="text"
                value={jiraJql}
                onChange={(e) => setJiraJql(e.target.value)}
                placeholder="project = VPL AND ..."
                className="flex-1 bg-transparent text-xs text-white/60 placeholder-white/20 focus:outline-none font-mono"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runJiraSearch(); } }}
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={runJiraSearch}
              disabled={loadingJira}
              className="ml-auto"
            >
              {loadingJira ? "Searching..." : "Search"}
            </Button>
          </div>
        )}

        {detectedKey && (
          <button
            type="button"
            onClick={() => !fetchingKey && navigateToKey(detectedKey, false)}
            disabled={fetchingKey}
            className="w-full flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-2 text-left cursor-pointer disabled:cursor-default"
            style={{ backgroundColor: "rgba(74, 170, 96, 0.07)" }}
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold"
              style={{ backgroundColor: "rgba(74, 170, 96, 0.18)", color: "var(--color-brand-400)" }}
            >
              {detectedKey}
            </span>
            <span className="text-[11px] text-white/40">
              {fetchingKey ? "Downloading from Jira..." : "Press Enter to open directly"}
            </span>
          </button>
        )}

        {/* Filter panel — only in local mode, hidden by default */}
        {mode === "local" && showFilters && (
          <SearchFilterPanel
            filters={filters}
            onChange={setFilters}
            filterOptions={filterOptions}
            sectionCounts={{ tickets: groupedResults.tickets.length, conversations: groupedResults.conversations.length, comments: groupedResults.comments.length } satisfies SectionCounts}
          />
        )}

        <div className="flex" style={{ minHeight: showPreview ? 340 : undefined }}>
          <div
            ref={listRef}
            className="overflow-y-auto flex-1"
            style={{
              maxHeight: "min(700px, calc(100vh - 260px))",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.08) transparent",
              borderTop: showPreview ? (focusedPanel === "list" ? "2px solid rgba(74, 170, 96, 0.3)" : "2px solid transparent") : undefined,
              transition: "border-color 150ms",
            }}
          >
            {(showLocalSkeleton || showJiraSkeleton) && (
              <div>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} idx={i} />)}</div>
            )}
            {!loadingJira && mode === "jira" && jiraError && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-400/70">{jiraError}</div>
            )}

            {/* Local mode — grouped results */}
            {!showLocalSkeleton && mode === "local" && totalGroupedCount > 0 && (
              <div>
                {/* Tickets section */}
                {groupedResults.tickets.length > 0 && sectionVisible("tickets") && (
                  <GroupedResultSection
                    label="Tickets"
                    count={groupedResults.tickets.length}
                    collapsed={collapsedSections.has("tickets")}
                    onToggle={() => toggleSection("tickets")}
                    showAll={expandedSections.has("tickets")}
                    onShowMore={() => showMoreSection("tickets")}
                    initialLimit={TICKET_SECTION_LIMIT}
                  >
                    {(expandedSections.has("tickets")
                      ? groupedResults.tickets
                      : groupedResults.tickets.slice(0, TICKET_SECTION_LIMIT)
                    ).map((r) => {
                      const flatIdx = visibleRows.findIndex((row) => row.group === "tickets" && (row.item as LocalSearchResult).key === r.key);
                      return (
                        <div key={r.key} data-result-row="">
                          <LocalResultRow
                            result={r}
                            active={flatIdx === activeIdx}
                            onSelect={(newTab) => {
                              addSearch(effectiveLocalQuery);
                              if (newTab) {
                                window.open(`/tickets/${r.key}`, "_blank", "noopener,noreferrer");
                                window.focus();
                              } else {
                                router.push(`/tickets/${r.key}`);
                                onClose();
                              }
                            }}
                            onHover={() => setActiveIdx(flatIdx)}
                            sprintNameMap={sprintNameMap}
                            showKey={!showPreview}
                          />
                        </div>
                      );
                    })}
                  </GroupedResultSection>
                )}

                {/* Conversations section */}
                {groupedResults.conversations.length > 0 && sectionVisible("conversations") && (
                  <GroupedResultSection
                    label="Conversations"
                    count={groupedResults.conversations.length}
                    collapsed={collapsedSections.has("conversations")}
                    onToggle={() => toggleSection("conversations")}
                    showAll={expandedSections.has("conversations")}
                    onShowMore={() => showMoreSection("conversations")}
                  >
                    {(expandedSections.has("conversations")
                      ? groupedResults.conversations
                      : groupedResults.conversations.slice(0, SECTION_LIMIT)
                    ).map((r) => {
                      const flatIdx = visibleRows.findIndex((row) => row.group === "conversations" && (row.item as ConversationSearchResult).id === r.id);
                      return (
                        <div key={r.id} data-result-row="">
                          <ConversationResultRow
                            result={r}
                            active={flatIdx === activeIdx}
                            onSelect={(newTab) => {
                              addSearch(effectiveLocalQuery);
                              if (newTab) {
                                window.open(`/chat/${r.id}`, "_blank", "noopener,noreferrer");
                                window.focus();
                              } else {
                                router.push(`/chat/${r.id}`);
                                onClose();
                              }
                            }}
                            onHover={() => setActiveIdx(flatIdx)}
                          />
                        </div>
                      );
                    })}
                  </GroupedResultSection>
                )}

                {/* Comments section */}
                {groupedResults.comments.length > 0 && sectionVisible("comments") && (
                  <GroupedResultSection
                    label="Comments"
                    count={groupedResults.comments.length}
                    collapsed={collapsedSections.has("comments")}
                    onToggle={() => toggleSection("comments")}
                    showAll={expandedSections.has("comments")}
                    onShowMore={() => showMoreSection("comments")}
                  >
                    {(expandedSections.has("comments")
                      ? groupedResults.comments
                      : groupedResults.comments.slice(0, SECTION_LIMIT)
                    ).map((r) => {
                      const flatIdx = visibleRows.findIndex((row) => row.group === "comments" && (row.item as CommentSearchResult).id === r.id);
                      return (
                        <div key={r.id} data-result-row="">
                          <CommentResultRow
                            result={r}
                            active={flatIdx === activeIdx}
                            onSelect={(newTab) => {
                              addSearch(effectiveLocalQuery);
                              if (newTab) {
                                window.open(`/tickets/${r.ticketKey}`, "_blank", "noopener,noreferrer");
                                window.focus();
                              } else {
                                router.push(`/tickets/${r.ticketKey}`);
                                onClose();
                              }
                            }}
                            onHover={() => setActiveIdx(flatIdx)}
                          />
                        </div>
                      );
                    })}
                  </GroupedResultSection>
                )}
              </div>
            )}

            {/* Jira results */}
            {!showJiraSkeleton && mode === "jira" && jiraResults.length > 0 && (
              <div>
                {jiraResults.map((issue, i) => (
                  <div key={issue.key} data-result-row="">
                    <JiraResultRow
                      issue={issue}
                      active={i === activeIdx}
                      onSelect={(newTab) => {
                        addSearch(jiraQuery || query);
                        if (newTab) {
                          window.open(`/tickets/${issue.key}`, "_blank", "noopener,noreferrer");
                          window.focus();
                        } else {
                          router.push(`/tickets/${issue.key}`);
                          onClose();
                        }
                      }}
                      onHover={() => setActiveIdx(i)}
                      showKey={!showPreview}
                    />
                  </div>
                ))}
              </div>
            )}
            {/* Saved searches — shown when query is empty and saved searches exist */}
            {!showLocalSkeleton && showSavedSearches && (
              <div className="py-2">
                <div className="flex items-center px-5 pb-1 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Saved searches</span>
                </div>
                {savedSearches.map((s) => (
                  <div
                    key={s.id}
                    className="group flex w-full items-center gap-3 px-6 py-2.5 text-left"
                    style={{ transition: "background-color 80ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(s.query);
                        setFilters(s.filters);
                        if (hasActiveFilters(s.filters)) setShowFilters(true);
                      }}
                      className="flex flex-1 items-center gap-3 cursor-pointer focus-visible:outline-none min-w-0"
                    >
                      <Bookmark className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-brand-400)", opacity: 0.7 }} strokeWidth={1.5} />
                      <span className="text-[13px] truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{s.label}</span>
                      {hasActiveFilters(s.filters) && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: "rgba(74, 170, 96, 0.1)", color: "var(--color-brand-400)" }}
                        >
                          filtered
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete saved search "${s.label}"`}
                      onClick={(e) => { e.stopPropagation(); deleteSearch(s.id); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer rounded p-0.5 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                      style={{ color: "rgba(255,255,255,0.3)", transition: "opacity 100ms, color 100ms" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,100,100,0.7)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
                {showHistory && <div className="mx-5 my-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />}
              </div>
            )}

            {/* Search history — shown when query is empty and history exists */}
            {!showLocalSkeleton && showHistory && (
              <div className="py-2">
                <div className="flex items-center justify-between px-5 pb-1 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Recent searches</span>
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-[10px] cursor-pointer"
                    style={{ color: "rgba(255,255,255,0.25)", transition: "color 100ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                  >
                    Clear
                  </button>
                </div>
                {searchHistory.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuery(q)}
                    className="flex w-full items-center gap-3 px-6 py-2.5 text-left cursor-pointer focus-visible:outline-none"
                    style={{ transition: "background-color 80ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-white/20" strokeWidth={1.5} />
                    <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>{q}</span>
                  </button>
                ))}
              </div>
            )}

            {!showLocalSkeleton && !showJiraSkeleton && !jiraError && !showHistory && !showSavedSearches && (
              (mode === "local" && totalGroupedCount === 0) ||
              (mode === "jira" && jiraResults.length === 0 && !loadingJira)
            ) && <EmptyState query={displayQuery} mode={mode} onSwitchToJira={switchToJira} />}
          </div>

          {showPreview && activeResult && (
            <>
              <div
                onMouseDown={onDragHandleMouseDown}
                className="relative flex w-2 shrink-0 cursor-col-resize items-center justify-center"
                style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="h-12 w-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
              </div>
              <div
                ref={previewPaneRef}
                className="overflow-y-auto p-5 shrink-0"
                style={{
                  width: previewWidth,
                  maxHeight: "min(700px, calc(100vh - 260px))",
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(255,255,255,0.08) transparent",
                  borderTop: focusedPanel === "preview" ? "2px solid rgba(74, 170, 96, 0.3)" : "2px solid transparent",
                  transition: "border-color 150ms",
                }}
              >
                <PreviewPane
                  result={activeResult}
                  sprintNameMap={sprintNameMap}
                  onClose={onClose}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-6 py-3 text-[10px] text-white/20">
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">{"\u2191\u2193"}</kbd> navigate</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">{"\u21b5"}</kbd> open</span>
          {mode === "local" && previewEnabled && activeIdx >= 0 && visibleRows[activeIdx]?.group === "tickets" && (
            <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">{"\u2192"}</kbd> preview</span>
          )}
          {focusedPanel === "preview" && (
            <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">{"\u2190"}</kbd> list</span>
          )}
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">{"\u21e7\u21b5"}</kbd> new tab</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">esc</kbd> close</span>
          <div className="flex-1" />
          {/* Save this search — shown in local mode when there's a meaningful query */}
          {mode === "local" && query.trim().length >= 2 && (
            savingSearch ? (
              <div
                className="flex items-center gap-1"
                style={{ animation: "saveInputIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSaveConfirm(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); handleSaveCancel(); }
                }}
              >
                <div
                  className="flex items-center gap-1.5 overflow-hidden rounded-md"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(74, 170, 96, 0.35)",
                    padding: "2px 6px 2px 8px",
                  }}
                >
                  <Bookmark className="h-3 w-3 shrink-0" style={{ color: "var(--color-brand-400)", opacity: 0.7 }} strokeWidth={1.5} />
                  <input
                    ref={saveInputRef}
                    type="text"
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Name this search..."
                    maxLength={200}
                    className="bg-transparent text-[12px] text-white/80 placeholder-white/20 focus:outline-none"
                    style={{ width: 160 }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveConfirm}
                    disabled={!saveLabel.trim()}
                    title="Save"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                    style={{
                      backgroundColor: saveLabel.trim() ? "rgba(74, 170, 96, 0.2)" : "transparent",
                      color: saveLabel.trim() ? "var(--color-brand-400)" : "rgba(255,255,255,0.2)",
                      transition: "background-color 100ms, color 100ms",
                    }}
                  >
                    <Check className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCancel}
                    title="Cancel"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ color: "rgba(255,255,255,0.2)", transition: "color 100ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isCurrentSearchSaved || isFull}
                title={isCurrentSearchSaved ? "Already saved" : isFull ? "Max 10 saved searches reached" : "Save this search"}
                onClick={handleSaveOpen}
                className="flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-default"
                style={{
                  backgroundColor: isCurrentSearchSaved ? "rgba(74, 170, 96, 0.1)" : "rgba(255,255,255,0.04)",
                  color: isCurrentSearchSaved ? "var(--color-brand-400)" : isFull ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.25)",
                  transition: "background-color 120ms, color 120ms",
                }}
              >
                {isCurrentSearchSaved
                  ? <BookmarkCheck className="h-3 w-3" strokeWidth={1.5} />
                  : <Bookmark className="h-3 w-3" strokeWidth={1.5} />}
                {isCurrentSearchSaved ? "Saved" : "Save"}
              </button>
            )
          )}
          {mode === "local" && (
            <button
              type="button"
              onClick={() => setPreviewEnabled((v) => !v)}
              className="flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
              style={{
                backgroundColor: previewEnabled ? "rgba(74, 170, 96, 0.1)" : "rgba(255,255,255,0.04)",
                color: previewEnabled ? "var(--color-brand-400)" : "rgba(255,255,255,0.25)",
                transition: "background-color 120ms, color 120ms",
              }}
            >
              {previewEnabled ? <PanelRightClose className="h-3 w-3" strokeWidth={1.5} /> : <PanelRight className="h-3 w-3" strokeWidth={1.5} />}
              Preview
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes searchModalIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes saveInputIn {
          from { opacity: 0; transform: scaleX(0.85) translateX(6px); }
          to { opacity: 1; transform: scaleX(1) translateX(0); }
        }
      `}</style>
    </div>
  );
}
