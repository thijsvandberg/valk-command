import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, search, jira, ApiError } from "@/lib/api-client";
import { filtersToParams, type SearchFilters, type FilterOptionsData } from "@/components/sprint-board/SearchFilterPanel";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";

interface GroupedResults {
  tickets: LocalSearchResult[];
  conversations: ConversationSearchResult[];
  comments: CommentSearchResult[];
}

const EMPTY_GROUPED: GroupedResults = { tickets: [], conversations: [], comments: [] };

export function useSearchActions(opts: {
  open: boolean;
  mode: "local" | "jira";
  query: string;
  jiraQuery: string;
  jiraJql: string;
  effectiveLocalQuery: string;
  filters: SearchFilters;
  onClose: () => void;
  setActiveIdx: (v: number) => void;
  setExpandedSections: (v: Set<string>) => void;
}) {
  const { open, mode, query, jiraQuery, jiraJql, effectiveLocalQuery, filters, onClose, setActiveIdx, setExpandedSections } = opts;
  const router = useRouter();
  const [groupedResults, setGroupedResults] = useState<GroupedResults>(EMPTY_GROUPED);
  const [jiraResults, setJiraResults] = useState<JiraSearchResult[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingJira, setLoadingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [fetchingKey, setFetchingKey] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsData | null>(null);
  const filterOptionsFetchedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);

  const runLocalSearch = useCallback(async (q: string, activeFilters: SearchFilters) => {
    if (q.trim().length < 2) { setGroupedResults(EMPTY_GROUPED); return; }
    if (localAbortRef.current) localAbortRef.current.abort();
    localAbortRef.current = new AbortController();
    const { signal } = localAbortRef.current;
    setLoadingLocal(true);
    try {
      const params = new URLSearchParams({ q });
      for (const [k, v] of filtersToParams(activeFilters).entries()) params.set(k, v);
      const data = await apiFetch<{ groups?: { tickets?: LocalSearchResult[]; conversations?: ConversationSearchResult[]; comments?: CommentSearchResult[] }; results?: LocalSearchResult[] }>(`/api/search/local?${params.toString()}`, { signal });
      if (data.groups) {
        setGroupedResults({ tickets: data.groups.tickets ?? [], conversations: data.groups.conversations ?? [], comments: data.groups.comments ?? [] });
      } else {
        setGroupedResults({ tickets: data.results ?? [], conversations: [], comments: [] });
      }
      setActiveIdx(-1); setExpandedSections(new Set());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally { setLoadingLocal(false); }
  }, [setActiveIdx, setExpandedSections]);

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
    setLoadingJira(true); setJiraError(null); setJiraResults([]);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (jqlOverride) params.set("jql", jqlOverride);
      const data = await apiFetch<{ issues?: JiraSearchResult[] }>(`/api/search/jira?${params.toString()}`);
      setJiraResults(data.issues ?? []); setActiveIdx(-1);
    } catch (err) {
      if (err instanceof ApiError) { setJiraError(err.body?.error ?? "Search failed"); }
      else { setJiraError("Network error -- check Jira connectivity"); }
    } finally { setLoadingJira(false); }
  }, [query, jiraQuery, jiraJql, setActiveIdx]);

  const openFilters = useCallback(async () => {
    if (!filterOptionsFetchedRef.current) {
      filterOptionsFetchedRef.current = true;
      try { const data = await search.filterOptions() as FilterOptionsData; setFilterOptions(data); } catch { /* non-critical */ }
    }
  }, []);

  const navigateToKey = useCallback(async (key: string, newTab: boolean) => {
    const existsLocally = groupedResults.tickets.some((r) => r.key === key);
    if (!existsLocally) {
      setFetchingKey(true);
      try { await jira.syncTickets({ ticketKeys: [key] }); } catch { /* navigate anyway */ } finally { setFetchingKey(false); }
    }
    if (newTab) { window.open(`/tickets/${key}`, "_blank", "noopener,noreferrer"); window.focus(); }
    else { router.push(`/tickets/${key}`); onClose(); }
  }, [groupedResults.tickets, router, onClose]);

  const resetSearchState = useCallback(() => {
    setGroupedResults(EMPTY_GROUPED); setJiraResults([]); setJiraError(null);
  }, []);

  return {
    groupedResults, jiraResults, loadingLocal, loadingJira, jiraError, fetchingKey, filterOptions,
    runJiraSearch, openFilters, navigateToKey, resetSearchState,
  };
}
