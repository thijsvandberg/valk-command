"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import type { FuseResultMatch } from "fuse.js";
import type { LocalSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchMode = "local" | "jira";

interface SearchModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  /** Called when user selects a locally-known ticket key */
  onSelectTicket: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Status badge color map (matches TicketTable)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(46, 145, 73, 0.15)", text: "#4aaa60" },
  TEST: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
  DONE: { bg: "rgba(46, 145, 73, 0.25)", text: "#2e9149" },
  DEPRECATED: { bg: "rgba(239, 68, 68, 0.12)", text: "#ef4444" },
};

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const color = STATUS_COLORS[upper] ?? { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {upper}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Match highlight: renders summary text with <mark> on matched character ranges
// ---------------------------------------------------------------------------

function HighlightedText({ text, matches, fieldName }: { text: string; matches?: readonly FuseResultMatch[]; fieldName: string }) {
  const summaryMatch = matches?.find(
    (m) => m.key === fieldName && m.value === text,
  );

  if (!summaryMatch || !summaryMatch.indices || summaryMatch.indices.length === 0) {
    return <span>{text}</span>;
  }

  const intervals = [...summaryMatch.indices].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of intervals) {
    if (start > cursor) {
      parts.push(<span key={cursor}>{text.slice(cursor, start)}</span>);
    }
    parts.push(
      <mark
        key={start}
        className="rounded-[2px] px-[1px]"
        style={{
          backgroundColor: "rgba(74, 170, 96, 0.18)",
          color: "#7ac48a",
          textDecoration: "none",
        }}
      >
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }

  if (cursor < text.length) {
    parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
  }

  return <span>{parts}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton loading rows
// ---------------------------------------------------------------------------

function SkeletonRow({ idx }: { idx: number }) {
  const widths = ["w-48", "w-56", "w-40", "w-52", "w-44"];
  const w = widths[idx % widths.length];
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <div className="h-3 w-14 animate-pulse rounded bg-white/[0.06]" />
      <div className={`h-3 animate-pulse rounded bg-white/[0.06] ${w}`} />
      <div className="ml-auto h-4 w-14 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local result row
// ---------------------------------------------------------------------------

function LocalResultRow({
  result,
  active,
  onSelect,
  onHover,
}: {
  result: LocalSearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      className="group relative flex w-full items-center gap-3 px-6 py-3.5 text-left focus-visible:outline-none"
      style={{
        backgroundColor: active ? "rgba(74, 170, 96, 0.06)" : undefined,
        borderLeft: active ? "2px solid var(--color-brand-400)" : "2px solid transparent",
      }}
      onClick={onSelect}
      onMouseMove={onHover}
    >
      {/* Hover background when not active */}
      {!active && (
        <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(255,255,255,0.025)" }} />
      )}

      {/* Ticket key */}
      <span className="shrink-0 font-mono text-[13px] text-white/30 w-20 truncate">{result.key}</span>

      {/* Summary with highlights */}
      <span className="min-w-0 flex-1 truncate text-[14px] text-white/75">
        <HighlightedText text={result.summary} matches={result.matches} fieldName="summary" />
      </span>

      {/* Right side: sprint + status */}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {result.sprintName && (
          <span className="text-xs text-white/25 hidden sm:block truncate max-w-[140px]">
            {result.sprintName}
          </span>
        )}
        <StatusBadge status={result.status} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Jira result row
// ---------------------------------------------------------------------------

function JiraResultRow({
  issue,
  active,
  onSelect,
  onHover,
}: {
  issue: JiraSearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      className="group relative flex w-full items-center gap-3 px-6 py-3.5 text-left focus-visible:outline-none"
      style={{
        backgroundColor: active ? "rgba(74, 170, 96, 0.06)" : undefined,
        borderLeft: active ? "2px solid var(--color-brand-400)" : "2px solid transparent",
      }}
      onClick={onSelect}
      onMouseMove={onHover}
    >
      {!active && (
        <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(255,255,255,0.025)" }} />
      )}

      <span className="shrink-0 font-mono text-[13px] text-white/30 w-20 truncate">{issue.key}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-white/75">{issue.summary}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {issue.sprintName && (
          <span className="text-xs text-white/25 hidden sm:block truncate max-w-[140px]">
            {issue.sprintName}
          </span>
        )}
        <StatusBadge status={issue.status} />
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: "rgba(96, 165, 250, 0.12)", color: "#60a5fa" }}
        >
          Jira
        </span>
        <ExternalLink className="h-3 w-3 text-white/20" strokeWidth={1.5} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ query, mode }: { query: string; mode: SearchMode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <Search className="h-4 w-4 text-white/20" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-white/30">
        {query.length < 2
          ? "Type at least 2 characters to search"
          : mode === "local"
            ? `No tickets matched "${query}"`
            : `No Jira results for "${query}"`}
      </p>
      {query.length >= 2 && mode === "local" && (
        <p className="text-xs text-white/20">Try switching to Jira mode for live results</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchModal
// ---------------------------------------------------------------------------

export function SearchModal({ open, initialQuery = "", onClose, onSelectTicket }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>("local");
  const [localResults, setLocalResults] = useState<LocalSearchResult[]>([]);
  const [jiraResults, setJiraResults] = useState<JiraSearchResult[]>([]);
  const [jiraQuery, setJiraQuery] = useState("");
  const [jiraJql, setJiraJql] = useState("");
  const [showJqlOverride, setShowJqlOverride] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingJira, setLoadingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);

  // Sync query with initialQuery when modal opens
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setMode("local");
      setLocalResults([]);
      setJiraResults([]);
      setJiraError(null);
      setActiveIdx(0);
      // Focus input after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialQuery]);

  // Local search with debounce
  const runLocalSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setLocalResults([]);
      return;
    }

    if (localAbortRef.current) {
      localAbortRef.current.abort();
    }
    localAbortRef.current = new AbortController();
    const { signal } = localAbortRef.current;

    setLoadingLocal(true);
    try {
      const res = await fetch(`/api/search/local?q=${encodeURIComponent(q)}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setLocalResults(data.results ?? []);
        setActiveIdx(0);
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
    debounceRef.current = setTimeout(() => runLocalSearch(query), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode, open, runLocalSearch]);

  // Jira search (on demand)
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
        setActiveIdx(0);
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

  // Keyboard navigation
  const resultCount = mode === "local" ? localResults.length : jiraResults.length;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, resultCount - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "local") {
        const result = localResults[activeIdx];
        if (result) {
          onSelectTicket(result.key);
          onClose();
        }
      } else {
        if (loadingJira) return;
        if (jiraResults.length > 0) {
          const issue = jiraResults[activeIdx];
          if (issue) {
            // Check if we have it locally; if so, open side panel; otherwise open Jira URL
            onSelectTicket(issue.key);
            onClose();
          }
        } else {
          runJiraSearch();
        }
      }
    }
  }, [mode, localResults, jiraResults, activeIdx, resultCount, loadingJira, onClose, onSelectTicket, runJiraSearch]);

  // Scroll active row into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[data-result-row]");
    const row = rows[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const displayQuery = mode === "local" ? query : (jiraQuery || query);
  const showLocalSkeleton = loadingLocal && mode === "local";
  const showJiraSkeleton = loadingJira && mode === "jira";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop blur layer */}
      <div className="absolute inset-0 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-[860px] overflow-hidden rounded-xl"
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
          animation: "searchModalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input area */}
        <div className="flex items-center gap-4 border-b border-white/[0.06] px-6 py-4">
          <Search className="h-5 w-5 shrink-0 text-white/35" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={mode === "local" ? query : (jiraQuery || query)}
            onChange={(e) => {
              if (mode === "local") {
                setQuery(e.target.value);
              } else {
                setJiraQuery(e.target.value);
              }
            }}
            placeholder={mode === "local" ? "Search tickets..." : "Search Jira..."}
            className="flex-1 bg-transparent text-[15px] text-white/90 placeholder-white/25 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 cursor-pointer hover:text-white/60 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:text-white/80"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-6 py-2.5">
          <button
            type="button"
            onClick={() => { setMode("local"); setActiveIdx(0); }}
            className={[
              "rounded-full px-4 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
              mode === "local"
                ? "bg-[var(--color-brand-400)] text-white"
                : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]",
            ].join(" ")}
            style={{ transition: "background-color 100ms, color 100ms" }}
          >
            Local
          </button>
          <button
            type="button"
            onClick={() => { setMode("jira"); setActiveIdx(0); }}
            className={[
              "rounded-full px-4 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
              mode === "jira"
                ? "bg-[var(--color-brand-400)] text-white"
                : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]",
            ].join(" ")}
            style={{ transition: "background-color 100ms, color 100ms" }}
          >
            Jira
          </button>
        </div>

        {/* Jira mode: JQL override toggle + search button */}
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
            <button
              type="button"
              onClick={runJiraSearch}
              disabled={loadingJira}
              className="ml-auto rounded px-3 py-1 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-50"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              {loadingJira ? "Searching..." : "Search"}
            </button>
          </div>
        )}

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-[520px] overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
        >
          {/* Skeleton rows */}
          {(showLocalSkeleton || showJiraSkeleton) && (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} idx={i} />
              ))}
            </div>
          )}

          {/* Jira error */}
          {!loadingJira && mode === "jira" && jiraError && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-400/70">
              {jiraError}
            </div>
          )}

          {/* Local results */}
          {!showLocalSkeleton && mode === "local" && localResults.length > 0 && (
            <div>
              {localResults.map((r, i) => (
                <div key={r.key} data-result-row="">
                  <LocalResultRow
                    result={r}
                    active={i === activeIdx}
                    onSelect={() => { onSelectTicket(r.key); onClose(); }}
                    onHover={() => setActiveIdx(i)}
                  />
                </div>
              ))}
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
                    onSelect={() => {
                      // If ticket may be known locally, select it via onSelectTicket;
                      // the parent can open the side panel if it's in local DB.
                      onSelectTicket(issue.key);
                      onClose();
                    }}
                    onHover={() => setActiveIdx(i)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!showLocalSkeleton && !showJiraSkeleton && !jiraError && (
            (mode === "local" && localResults.length === 0) ||
            (mode === "jira" && jiraResults.length === 0 && !loadingJira)
          ) && (
            <EmptyState query={displayQuery} mode={mode} />
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-6 py-3 text-[10px] text-white/20">
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">↵</kbd> {mode === "jira" && jiraResults.length === 0 ? "search" : "open"}</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">esc</kbd> close</span>
        </div>
      </div>

      <style>{`
        @keyframes searchModalIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
