"use client";

import { useRouter } from "next/navigation";
import { Clock, Bookmark, Trash2 } from "lucide-react";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/lib/local-search-engine";
import type { JiraSearchResult } from "@/app/api/search/jira/route";
import {
  LocalResultRow, JiraResultRow, ConversationResultRow, CommentResultRow,
  GroupedResultSection,
} from "@/components/sprint-board/SearchResultParts";
import { hasActiveFilters, serializeFilters, type SearchFilters } from "@/components/sprint-board/SearchFilterPanel";
import type { VisibleRow } from "@/components/sprint-board/useSearchKeyboard";

const TICKET_SECTION_LIMIT = 10;
const SECTION_LIMIT = 5;

interface GroupedResults {
  tickets: LocalSearchResult[];
  conversations: ConversationSearchResult[];
  comments: CommentSearchResult[];
}

// ---------------------------------------------------------------------------
// Local result sections (tickets, conversations, comments)
// ---------------------------------------------------------------------------

export function LocalResultSections({
  groupedResults, visibleRows, activeIdx, setActiveIdx,
  expandedSections, collapsedSections, filters,
  toggleSection, showMoreSection, sectionVisible,
  effectiveLocalQuery, addSearch, onClose, sprintNameMap, showPreview,
}: {
  groupedResults: GroupedResults;
  visibleRows: VisibleRow[];
  activeIdx: number;
  setActiveIdx: (v: number) => void;
  expandedSections: Set<string>;
  collapsedSections: Set<string>;
  filters: SearchFilters;
  toggleSection: (key: string) => void;
  showMoreSection: (key: string) => void;
  sectionVisible: (key: string) => boolean;
  effectiveLocalQuery: string;
  addSearch: (q: string) => void;
  onClose: () => void;
  sprintNameMap?: Record<string, string>;
  showPreview: boolean;
}) {
  const router = useRouter();
  return (
    <div>
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
                    if (newTab) { window.open(`/tickets/${r.key}`, "_blank", "noopener,noreferrer"); window.focus(); }
                    else { router.push(`/tickets/${r.key}`); onClose(); }
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
                    if (newTab) { window.open(`/chat/${r.id}`, "_blank", "noopener,noreferrer"); window.focus(); }
                    else { router.push(`/chat/${r.id}`); onClose(); }
                  }}
                  onHover={() => setActiveIdx(flatIdx)}
                />
              </div>
            );
          })}
        </GroupedResultSection>
      )}

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
                    if (newTab) { window.open(`/tickets/${r.ticketKey}`, "_blank", "noopener,noreferrer"); window.focus(); }
                    else { router.push(`/tickets/${r.ticketKey}`); onClose(); }
                  }}
                  onHover={() => setActiveIdx(flatIdx)}
                />
              </div>
            );
          })}
        </GroupedResultSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jira result list
// ---------------------------------------------------------------------------

export function JiraResultList({
  jiraResults, activeIdx, setActiveIdx, addSearch, onClose, query, jiraQuery, showPreview,
}: {
  jiraResults: JiraSearchResult[];
  activeIdx: number;
  setActiveIdx: (v: number) => void;
  addSearch: (q: string) => void;
  onClose: () => void;
  query: string;
  jiraQuery: string;
  showPreview: boolean;
}) {
  const router = useRouter();
  return (
    <div>
      {jiraResults.map((issue, i) => (
        <div key={issue.key} data-result-row="">
          <JiraResultRow
            issue={issue}
            active={i === activeIdx}
            onSelect={(newTab) => {
              addSearch(jiraQuery || query);
              if (newTab) { window.open(`/tickets/${issue.key}`, "_blank", "noopener,noreferrer"); window.focus(); }
              else { router.push(`/tickets/${issue.key}`); onClose(); }
            }}
            onHover={() => setActiveIdx(i)}
            showKey={!showPreview}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved searches panel
// ---------------------------------------------------------------------------

interface SavedSearch {
  id: string;
  label: string;
  query: string;
  filters: SearchFilters;
}

export function SavedSearchesPanel({
  savedSearches, setQuery, setFilters, setShowFilters, deleteSearch, showDivider,
}: {
  savedSearches: SavedSearch[];
  setQuery: (q: string) => void;
  setFilters: (f: SearchFilters) => void;
  setShowFilters: (v: boolean) => void;
  deleteSearch: (id: string) => void;
  showDivider: boolean;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center px-5 pb-1 pt-2">
        <span className="text-caption font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Saved searches</span>
      </div>
      {savedSearches.map((s) => (
        <div
          key={s.id}
          className="group flex w-full items-center gap-3 px-6 py-2.5 text-left"
          style={{ transition: "background-color 80ms" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-overlay-subtle)")}
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
            <span className="text-body truncate" style={{ color: "var(--color-text-secondary)" }}>{s.label}</span>
            {hasActiveFilters(s.filters) && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium"
                style={{ backgroundColor: "var(--color-brand-subtle)", color: "var(--color-brand-400)" }}
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
            style={{ color: "var(--color-text-tertiary)", transition: "opacity 100ms, color 100ms" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "color-mix(in srgb, #ff6464 70%, transparent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
      {showDivider && <div className="mx-5 my-1 h-px" style={{ backgroundColor: "var(--color-overlay-subtle)" }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search history panel
// ---------------------------------------------------------------------------

export function SearchHistoryPanel({
  searchHistory, setQuery, clearHistory,
}: {
  searchHistory: string[];
  setQuery: (q: string) => void;
  clearHistory: () => void;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-5 pb-1 pt-2">
        <span className="text-caption font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Recent searches</span>
        <button
          type="button"
          onClick={clearHistory}
          className="text-caption cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ color: "var(--color-text-muted)", transition: "color 100ms" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
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
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-overlay-subtle)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
        >
          <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
          <span className="text-body" style={{ color: "var(--color-text-secondary)" }}>{q}</span>
        </button>
      ))}
    </div>
  );
}
