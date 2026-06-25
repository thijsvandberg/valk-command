"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { tickets } from "@/lib/api-client";
import type { LinkSearchResult, LinkSearchFilters, LinkSearchFacets } from "@/lib/api-client";

const PAGE_SIZE = 25;

export type { LinkSearchResult, LinkSearchFilters, LinkSearchFacets };

const EMPTY_FACETS: LinkSearchFacets = { types: [], projects: [], assignees: [] };

// Filters that survive a query change. Multi-value facets mirror the board's
// FilterDropdown idiom (Set-backed). `preset` is one-shot (resolved server-side
// against the current ticket) and shares the epic/sprint slots.
export interface LinkFilterState {
  types: string[];
  sprints: string[];
  epics: string[];
  assignees: string[];
  projects: string[];
  updatedWithin: string | null;
  preset: "epic" | "sprint" | null;
}

const EMPTY_FILTERS: LinkFilterState = {
  types: [],
  sprints: [],
  epics: [],
  assignees: [],
  projects: [],
  updatedWithin: null,
  preset: null,
};

function hasActiveFilters(f: LinkFilterState): boolean {
  return (
    f.types.length > 0 ||
    f.sprints.length > 0 ||
    f.epics.length > 0 ||
    f.assignees.length > 0 ||
    f.projects.length > 0 ||
    !!f.updatedWithin ||
    !!f.preset
  );
}

export interface UseLinkIssueSearchReturn {
  query: string;
  setQuery: (value: string) => void;
  results: LinkSearchResult[];
  filteredResults: LinkSearchResult[];
  isSearching: boolean;
  isSearchingJira: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  recentResults: LinkSearchResult[];
  availableStatuses: Array<{ status: string; count: number }>;
  activeStatuses: Set<string>;
  toggleStatus: (status: string) => void;
  clearStatusFilter: () => void;
  resetSearch: () => void;
  showResults: boolean;
  setShowResults: (show: boolean) => void;
  highlightIndex: number;
  setHighlightIndex: (index: number | ((prev: number) => number)) => void;
  filters: LinkFilterState;
  setFilter: <K extends keyof LinkFilterState>(key: K, value: LinkFilterState[K]) => void;
  applyPreset: (preset: "epic" | "sprint") => void;
  clearFilters: () => void;
  filtersActive: boolean;
  facets: LinkSearchFacets;
}

export function useLinkIssueSearch(ticketKey: string): UseLinkIssueSearchReturn {
  const [query, setQueryRaw] = useState("");
  const [results, setResults] = useState<LinkSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingJira, setIsSearchingJira] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [recentResults, setRecentResults] = useState<LinkSearchResult[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [filters, setFilters] = useState<LinkFilterState>(EMPTY_FILTERS);
  const [facets, setFacets] = useState<LinkSearchFacets>(EMPTY_FACETS);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const jiraDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(0);
  // doSearch reads the latest filters without being recreated on every change.
  const filtersRef = useRef<LinkFilterState>(filters);
  filtersRef.current = filters;

  function toApiFilters(f: LinkFilterState): LinkSearchFilters {
    return {
      types: f.types,
      sprints: f.sprints,
      epics: f.epics,
      assignees: f.assignees,
      projects: f.projects,
      updatedWithin: f.updatedWithin,
      preset: f.preset,
    };
  }

  // Fetch recently updated tickets on mount. This also seeds the filter facets
  // (type/project/assignee option lists) so the dropdowns are populated before
  // the first search.
  useEffect(() => {
    let cancelled = false;
    tickets.recentlyUpdated(ticketKey).then((data) => {
      if (cancelled) return;
      setRecentResults(data.results);
      if (data.facets) setFacets(data.facets);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticketKey]);

  const doSearch = useCallback((q: string, offset = 0) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const activeFilters = filtersRef.current;
    const browseMode = q.length < 2 && hasActiveFilters(activeFilters);

    // Nothing to do: no usable query and no filters set.
    if (q.length < 2 && !browseMode) {
      setResults([]);
      setHasMore(false);
      setShowResults(false);
      setIsSearchingJira(false);
      return;
    }

    if (offset === 0) setIsSearching(true);
    else setIsLoadingMore(true);

    const apiFilters = toApiFilters(activeFilters);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (browseMode) {
          // Browse: filters with no text. Server paginates the filtered pool.
          const data = await tickets.recentlyUpdated(ticketKey, offset, apiFilters, controller.signal);
          if (controller.signal.aborted) return;
          setResults((prev) => (offset === 0 ? data.results : [...prev, ...data.results]));
          setHasMore(data.hasMore);
          if (data.facets) setFacets(data.facets);
          setShowResults(true);
          setHighlightIndex(-1);
          setIsSearching(false);
          setIsLoadingMore(false);
          offsetRef.current = offset;
          return;
        }

        // Phase 1: fast local-only search
        const localData = await tickets.searchForLink(q, ticketKey, offset, apiFilters, controller.signal);
        if (controller.signal.aborted) return;

        if (offset === 0) {
          setResults(localData.results);
        } else {
          setResults((prev) => [...prev, ...localData.results]);
        }
        setHasMore(localData.hasMore);
        if (localData.facets) setFacets(localData.facets);
        setShowResults(true);
        setHighlightIndex(-1);
        setIsSearching(false);
        setIsLoadingMore(false);
        offsetRef.current = offset;

        // Phase 2: Jira fallback (only on first page, and only for plain
        // searches — the server skips Jira when filters are active).
        if (offset === 0 && !hasActiveFilters(activeFilters) && localData.results.length < 5) {
          setIsSearchingJira(true);
          jiraDebounceRef.current = setTimeout(async () => {
            try {
              const fullData = await tickets.searchForLinkWithJira(q, ticketKey, 0, apiFilters, controller.signal);
              if (controller.signal.aborted) return;
              setResults(fullData.results);
              setHasMore(fullData.hasMore);
              if (fullData.facets) setFacets(fullData.facets);
              setHighlightIndex(-1);
            } catch {
              // Keep local results on Jira failure
            } finally {
              setIsSearchingJira(false);
            }
          }, 300);
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setIsSearching(false);
          setIsLoadingMore(false);
        }
      }
    }, offset === 0 ? 200 : 0);
  }, [ticketKey]);

  const setQuery = useCallback((value: string) => {
    // Extract issue key from Jira URLs
    const urlMatch = value.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const cleaned = urlMatch ? urlMatch[1].toUpperCase() : value;
    setQueryRaw(cleaned);
    setActiveStatuses(new Set());
    offsetRef.current = 0;
    doSearch(cleaned);
  }, [doSearch]);

  // Re-run the search whenever filters change, keeping the current query.
  const applyFilters = useCallback((next: LinkFilterState) => {
    filtersRef.current = next;
    setFilters(next);
    setActiveStatuses(new Set());
    offsetRef.current = 0;
    doSearch(query, 0);
  }, [doSearch, query]);

  const setFilter = useCallback(<K extends keyof LinkFilterState>(key: K, value: LinkFilterState[K]) => {
    // Editing an explicit filter clears any active preset (they share the
    // epic/sprint slots and the preset would otherwise override it server-side).
    const next = { ...filtersRef.current, [key]: value, preset: null } as LinkFilterState;
    applyFilters(next);
  }, [applyFilters]);

  const applyPreset = useCallback((preset: "epic" | "sprint") => {
    const current = filtersRef.current;
    // Toggle off if the same preset is active again.
    const next: LinkFilterState = current.preset === preset
      ? { ...current, preset: null }
      : { ...current, preset, epics: [], sprints: [] };
    applyFilters(next);
  }, [applyFilters]);

  const clearFilters = useCallback(() => {
    applyFilters(EMPTY_FILTERS);
  }, [applyFilters]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    const browseMode = query.length < 2 && hasActiveFilters(filtersRef.current);
    if (query.length < 2 && !browseMode) return;
    const nextOffset = offsetRef.current + PAGE_SIZE;
    doSearch(query, nextOffset);
  }, [hasMore, isLoadingMore, query, doSearch]);

  // Derive available statuses from results
  const availableStatuses = (() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      const s = r.status.toUpperCase();
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const toggleStatus = useCallback((status: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const clearStatusFilter = useCallback(() => {
    setActiveStatuses(new Set());
  }, []);

  const filteredResults = activeStatuses.size === 0
    ? results
    : results.filter((r) => activeStatuses.has(r.status.toUpperCase()));

  const resetSearch = useCallback(() => {
    setQueryRaw("");
    setResults([]);
    setHasMore(false);
    setShowResults(false);
    setActiveStatuses(new Set());
    setHighlightIndex(-1);
    filtersRef.current = EMPTY_FILTERS;
    setFilters(EMPTY_FILTERS);
    offsetRef.current = 0;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return {
    query,
    setQuery,
    results,
    filteredResults,
    isSearching,
    isSearchingJira,
    hasMore,
    loadMore,
    isLoadingMore,
    recentResults,
    availableStatuses,
    activeStatuses,
    toggleStatus,
    clearStatusFilter,
    resetSearch,
    showResults,
    setShowResults,
    highlightIndex,
    setHighlightIndex,
    filters,
    setFilter,
    applyPreset,
    clearFilters,
    filtersActive: hasActiveFilters(filters),
    facets,
  };
}
