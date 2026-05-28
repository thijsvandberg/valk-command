"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { Button } from "@/components/ui/Button";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";
import type { FocusedPanel } from "@/components/sprint-board/SearchResultParts";
import { PreviewPane, SkeletonRow, EmptyState } from "@/components/sprint-board/SearchResultParts";
import { SearchFilterPanel, EMPTY_FILTERS, serializeFilters, type SearchFilters, type SectionCounts } from "@/components/sprint-board/SearchFilterPanel";
import { useSearchKeyboard, type VisibleRow } from "@/components/sprint-board/useSearchKeyboard";
import { useSearchActions } from "@/components/sprint-board/useSearchActions";
import { SearchModalFooter } from "@/components/sprint-board/SearchModalFooter";
import { LocalResultSections, JiraResultList, SavedSearchesPanel, SearchHistoryPanel } from "@/components/sprint-board/SearchModalSections";
import { SearchModalHeader } from "@/components/sprint-board/SearchModalHeader";

const TICKET_SECTION_LIMIT = 10;
const SECTION_LIMIT = 5;

function parseJiraKeyFromInput(input: string): string | null {
  const trimmed = input.trim();
  const m1 = trimmed.match(/\/browse\/([A-Za-z]+-\d+)/);
  if (m1) return m1[1].toUpperCase();
  const m2 = trimmed.match(/[?&]selectedIssue=([A-Za-z]+-\d+)/);
  if (m2) return m2[1].toUpperCase();
  const m3 = trimmed.match(/^([A-Za-z]+-\d+)$/);
  if (m3) return m3[1].toUpperCase();
  return null;
}

export function SearchModal({ open, initialQuery = "", onClose, onSelectTicket, sprintNameMap }: {
  open: boolean; initialQuery?: string; onClose: () => void; onSelectTicket: (key: string) => void; sprintNameMap?: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<"local" | "jira">("local");
  const [jiraQuery, setJiraQuery] = useState("");
  const [jiraJql, setJiraJql] = useState("");
  const [showJqlOverride, setShowJqlOverride] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(520);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>("list");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [savingSearch, setSavingSearch] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const { history: searchHistory, addSearch, clearHistory } = useSearchHistory();
  const { savedSearches, saveSearch, deleteSearch, isFull } = useSavedSearches();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(520);

  const activeInputValue = mode === "local" ? query : (jiraQuery || query);
  const detectedKey = parseJiraKeyFromInput(activeInputValue);
  const effectiveLocalQuery = detectedKey ?? query;

  const { groupedResults, jiraResults, loadingLocal, loadingJira, jiraError, fetchingKey, filterOptions, runJiraSearch, openFilters, navigateToKey, resetSearchState } = useSearchActions({
    open, mode, query, jiraQuery, jiraJql, effectiveLocalQuery, filters, onClose, setActiveIdx, setExpandedSections,
  });

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true; dragStartXRef.current = e.clientX; dragStartWidthRef.current = previewWidth; e.preventDefault();
  }, [previewWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) { if (!isDraggingRef.current) return; setPreviewWidth(Math.max(260, Math.min(720, dragStartWidthRef.current + (dragStartXRef.current - e.clientX)))); }
    function onMouseUp() { isDraggingRef.current = false; }
    window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!previewEnabled || activeIdx < 0) setFocusedPanel("list"); }, [previewEnabled, activeIdx]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (initialQuery) { setQuery(initialQuery); resetSearchState(); setActiveIdx(-1); setFocusedPanel("list"); }
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setShowFilters(false); setFilters(EMPTY_FILTERS); setCollapsedSections(new Set());
      setExpandedSections(new Set()); setSavingSearch(false); setSaveLabel("");
    }
  }, [open, initialQuery, resetSearchState]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onClose]);

  const visibleRows = useMemo<VisibleRow[]>(() => {
    if (mode !== "local") return [];
    const rows: VisibleRow[] = [];
    const addGroup = <T extends LocalSearchResult | ConversationSearchResult | CommentSearchResult>(groupKey: "tickets" | "conversations" | "comments", items: T[]) => {
      if (items.length === 0 || (filters.sections.size > 0 && !filters.sections.has(groupKey)) || collapsedSections.has(groupKey)) return;
      const limit = expandedSections.has(groupKey) ? items.length : (groupKey === "tickets" ? TICKET_SECTION_LIMIT : SECTION_LIMIT);
      for (const item of items.slice(0, limit)) rows.push({ group: groupKey, item } as VisibleRow);
    };
    addGroup("tickets", groupedResults.tickets); addGroup("conversations", groupedResults.conversations); addGroup("comments", groupedResults.comments);
    return rows;
  }, [mode, groupedResults, collapsedSections, expandedSections, filters.sections]);

  const totalGroupedCount = groupedResults.tickets.length + groupedResults.conversations.length + groupedResults.comments.length;

  const onLocalResultSelect = useCallback((row: VisibleRow, newTab: boolean) => {
    addSearch(effectiveLocalQuery);
    const key = row.group === "tickets" ? `/tickets/${(row.item as LocalSearchResult).key}` : row.group === "conversations" ? `/chat/${(row.item as ConversationSearchResult).id}` : `/tickets/${(row.item as CommentSearchResult).ticketKey}`;
    if (newTab) { window.open(key, "_blank", "noopener,noreferrer"); window.focus(); } else { router.push(key); onClose(); }
  }, [addSearch, effectiveLocalQuery, router, onClose]);

  const onJiraResultSelect = useCallback((issue: JiraSearchResult, newTab: boolean) => {
    addSearch(jiraQuery || query);
    if (newTab) { window.open(`/tickets/${issue.key}`, "_blank", "noopener,noreferrer"); window.focus(); } else { router.push(`/tickets/${issue.key}`); onClose(); }
  }, [addSearch, jiraQuery, query, router, onClose]);

  const { handleKeyDown } = useSearchKeyboard({
    mode, focusedPanel, activeIdx, setActiveIdx, visibleRows, jiraResults, previewEnabled, setPreviewEnabled,
    setFocusedPanel, previewPaneRef, listRef, inputRef, detectedKey, navigateToKey, onLocalResultSelect, onJiraResultSelect, onRunJiraSearch: runJiraSearch, loadingJira,
  });

  const activeTicketResult = useMemo(() => {
    if (!previewEnabled || activeIdx < 0) return null;
    const row = visibleRows[activeIdx];
    return row?.group === "tickets" ? row.item as LocalSearchResult : null;
  }, [previewEnabled, activeIdx, visibleRows]);

  const switchToJira = useCallback(() => { setMode("jira"); setActiveIdx(-1); if (query.trim()) { setJiraQuery(query.trim()); setTimeout(() => runJiraSearch(), 0); } }, [query, runJiraSearch]);

  const handleSaveConfirm = useCallback(() => { const l = saveLabel.trim(); if (l) saveSearch(l, query.trim(), filters); setSavingSearch(false); setSaveLabel(""); requestAnimationFrame(() => inputRef.current?.focus()); }, [saveLabel, saveSearch, query, filters]);
  const handleSaveOpen = useCallback(() => { setSaveLabel(query.trim()); setSavingSearch(true); requestAnimationFrame(() => saveInputRef.current?.focus()); }, [query]);
  const handleSaveCancel = useCallback(() => { setSavingSearch(false); setSaveLabel(""); requestAnimationFrame(() => inputRef.current?.focus()); }, []);
  const handleOpenFilters = useCallback(() => { setShowFilters((v) => !v); openFilters(); }, [openFilters]);

  if (!open) return null;

  const showLocalSkeleton = loadingLocal && mode === "local";
  const showJiraSkeleton = loadingJira && mode === "jira";
  const showPreview = previewEnabled && mode === "local" && activeTicketResult !== null;
  const toggleSection = (key: string) => { setCollapsedSections((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const showMoreSection = (key: string) => { setExpandedSections((prev) => new Set(prev).add(key)); };
  const sectionVisible = (key: string) => filters.sections.size === 0 || filters.sections.has(key);
  const showHistory = mode === "local" && query.trim().length < 2 && searchHistory.length > 0;
  const showSavedSearches = mode === "local" && query.trim().length < 2 && savedSearches.length > 0;
  const isCurrentSearchSaved = mode === "local" && query.trim().length >= 2 && savedSearches.some((s) => s.query === query.trim() && JSON.stringify(serializeFilters(s.filters)) === JSON.stringify(serializeFilters(filters)));

  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[12vh]" style={{ backgroundColor: "color-mix(in srgb, black 55%, transparent)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pointer-events-none absolute inset-0 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-[1200px] overflow-hidden rounded-xl" style={{ backgroundColor: "var(--color-surface-floating)", boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px var(--color-overlay-default)", animation: "searchModalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)" }} onKeyDown={handleKeyDown}>
        <SearchModalHeader mode={mode} query={query} jiraQuery={jiraQuery} setQuery={setQuery} setJiraQuery={setJiraQuery} setMode={setMode} setActiveIdx={setActiveIdx} showFilters={showFilters} openFilters={handleOpenFilters} filters={filters} onClose={onClose} inputRef={inputRef} />
        {mode === "jira" && (
          <div className="border-b border-border-default px-6 py-2.5 flex items-center gap-3">
            <button type="button" onClick={() => setShowJqlOverride((v) => !v)} className="text-body-sm text-text-tertiary hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]">{showJqlOverride ? "Hide JQL" : "JQL override"}</button>
            {showJqlOverride && <input type="text" value={jiraJql} onChange={(e) => setJiraJql(e.target.value)} placeholder="project = VPL AND ..." className="flex-1 bg-transparent text-body-sm text-text-secondary placeholder-text-muted focus:outline-none font-mono" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runJiraSearch(); } }} />}
            <Button variant="secondary" size="sm" onClick={runJiraSearch} disabled={loadingJira} className="ml-auto">{loadingJira ? "Searching..." : "Search"}</Button>
          </div>
        )}
        {detectedKey && (
          <button type="button" onClick={() => !fetchingKey && navigateToKey(detectedKey, false)} disabled={fetchingKey} className="w-full flex items-center gap-2.5 border-b border-border-default px-5 py-2 text-left cursor-pointer disabled:cursor-default" style={{ backgroundColor: "color-mix(in srgb, var(--color-status-success) 7%, transparent)" }}>
            <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-label font-semibold" style={{ backgroundColor: "var(--color-brand-subtle-hover)", color: "var(--color-brand-400)" }}>{detectedKey}</span>
            <span className="text-label text-text-tertiary">{fetchingKey ? "Downloading from Jira..." : "Press Enter to open directly"}</span>
          </button>
        )}
        {mode === "local" && showFilters && <SearchFilterPanel filters={filters} onChange={setFilters} filterOptions={filterOptions} sectionCounts={{ tickets: groupedResults.tickets.length, conversations: groupedResults.conversations.length, comments: groupedResults.comments.length } satisfies SectionCounts} />}

        <div className="flex" style={{ minHeight: showPreview ? 340 : undefined }}>
          <div ref={listRef} className="overflow-y-auto flex-1" style={{ maxHeight: "min(700px, calc(100vh - 260px))", scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent", borderTop: showPreview ? (focusedPanel === "list" ? "2px solid color-mix(in srgb, var(--color-status-success) 30%, transparent)" : "2px solid transparent") : undefined, transition: "border-color 150ms" }}>
            {(showLocalSkeleton || showJiraSkeleton) && <div>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} idx={i} />)}</div>}
            {!loadingJira && mode === "jira" && jiraError && <div className="flex items-center gap-2 px-4 py-6 text-body-lg text-red-400/70">{jiraError}</div>}
            {!showLocalSkeleton && mode === "local" && totalGroupedCount > 0 && <LocalResultSections groupedResults={groupedResults} visibleRows={visibleRows} activeIdx={activeIdx} setActiveIdx={setActiveIdx} expandedSections={expandedSections} collapsedSections={collapsedSections} filters={filters} toggleSection={toggleSection} showMoreSection={showMoreSection} sectionVisible={sectionVisible} effectiveLocalQuery={effectiveLocalQuery} addSearch={addSearch} onClose={onClose} sprintNameMap={sprintNameMap} showPreview={showPreview} />}
            {!showJiraSkeleton && mode === "jira" && jiraResults.length > 0 && <JiraResultList jiraResults={jiraResults} activeIdx={activeIdx} setActiveIdx={setActiveIdx} addSearch={addSearch} onClose={onClose} query={query} jiraQuery={jiraQuery} showPreview={showPreview} />}
            {!showLocalSkeleton && showSavedSearches && <SavedSearchesPanel savedSearches={savedSearches} setQuery={setQuery} setFilters={setFilters} setShowFilters={setShowFilters} deleteSearch={deleteSearch} showDivider={showHistory} />}
            {!showLocalSkeleton && showHistory && <SearchHistoryPanel searchHistory={searchHistory} setQuery={setQuery} clearHistory={clearHistory} />}
            {!showLocalSkeleton && !showJiraSkeleton && !jiraError && !showHistory && !showSavedSearches && ((mode === "local" && totalGroupedCount === 0) || (mode === "jira" && jiraResults.length === 0 && !loadingJira)) && <EmptyState query={mode === "local" ? query : (jiraQuery || query)} mode={mode} onSwitchToJira={switchToJira} />}
          </div>
          {showPreview && activeTicketResult && (
            <>
              <div onMouseDown={onDragHandleMouseDown} className="relative flex w-2 shrink-0 cursor-col-resize items-center justify-center" style={{ borderLeft: "1px solid var(--color-overlay-default)" }}><div className="h-12 w-0.5 rounded-full" style={{ backgroundColor: "var(--color-overlay-strong)" }} /></div>
              <div ref={previewPaneRef} className="overflow-y-auto p-5 shrink-0" style={{ width: previewWidth, maxHeight: "min(700px, calc(100vh - 260px))", scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent", borderTop: focusedPanel === "preview" ? "2px solid color-mix(in srgb, var(--color-status-success) 30%, transparent)" : "2px solid transparent", transition: "border-color 150ms" }}>
                <PreviewPane result={activeTicketResult} sprintNameMap={sprintNameMap} onClose={onClose} />
              </div>
            </>
          )}
        </div>
        <SearchModalFooter mode={mode} previewEnabled={previewEnabled} setPreviewEnabled={setPreviewEnabled} activeIdx={activeIdx} visibleRows={visibleRows} focusedPanel={focusedPanel} query={query} isCurrentSearchSaved={isCurrentSearchSaved} isFull={isFull} savingSearch={savingSearch} saveLabel={saveLabel} setSaveLabel={setSaveLabel} onSaveOpen={handleSaveOpen} onSaveConfirm={handleSaveConfirm} onSaveCancel={handleSaveCancel} saveInputRef={saveInputRef} />
      </div>
      <style>{`
        @keyframes searchModalIn { from { opacity: 0; transform: scale(0.96) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes saveInputIn { from { opacity: 0; transform: scaleX(0.85) translateX(6px); } to { opacity: 1; transform: scaleX(1) translateX(0); } }
      `}</style>
    </div>
  );
}
