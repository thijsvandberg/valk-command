"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { tickets } from "@/lib/api-client";
import type { LinkSearchResult } from "@/lib/api-client";

const PAGE_SIZE = 25;

export type { LinkSearchResult };

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

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const jiraDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(0);

  // Fetch recently updated tickets on mount
  useEffect(() => {
    let cancelled = false;
    tickets.recentlyUpdated(ticketKey).then((data) => {
      if (!cancelled) setRecentResults(data.results);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticketKey]);

  const doSearch = useCallback((q: string, offset = 0) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.length < 2) {
      setResults([]);
      setHasMore(false);
      setShowResults(false);
      setIsSearchingJira(false);
      return;
    }

    if (offset === 0) setIsSearching(true);
    else setIsLoadingMore(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Phase 1: fast local-only search
        const localData = await tickets.searchForLink(q, ticketKey, offset, controller.signal);
        if (controller.signal.aborted) return;

        if (offset === 0) {
          setResults(localData.results);
        } else {
          setResults((prev) => [...prev, ...localData.results]);
        }
        setHasMore(localData.hasMore);
        setShowResults(true);
        setHighlightIndex(-1);
        setIsSearching(false);
        setIsLoadingMore(false);
        offsetRef.current = offset;

        // Phase 2: Jira fallback (only on first page)
        if (offset === 0 && localData.results.length < 5) {
          setIsSearchingJira(true);
          jiraDebounceRef.current = setTimeout(async () => {
            try {
              const fullData = await tickets.searchForLinkWithJira(q, ticketKey, 0, controller.signal);
              if (controller.signal.aborted) return;
              setResults(fullData.results);
              setHasMore(fullData.hasMore);
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

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || query.length < 2) return;
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
  };
}
