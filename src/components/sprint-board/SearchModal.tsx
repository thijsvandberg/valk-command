"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ExternalLink, PanelRight, PanelRightClose, IterationCw, Zap } from "lucide-react";
import type { FuseResultMatch } from "fuse.js";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import type { LocalSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { IssueType } from "@/types/ticket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchMode = "local" | "jira";
type FocusedPanel = "list" | "preview";

interface SearchModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  /** Called when user selects a locally-known ticket key (Jira mode) */
  onSelectTicket: (key: string) => void;
  sprintNameMap?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Status badge
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
// Relative date helper
// ---------------------------------------------------------------------------

function relativeDate(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Updated ${months}mo ago`;
  return `Updated ${Math.floor(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Preview pane
// ---------------------------------------------------------------------------

function PreviewPane({
  result,
  sprintNameMap,
  onClose,
}: {
  result: LocalSearchResult;
  sprintNameMap?: Record<string, string>;
  onClose: () => void;
}) {
  const updatedLabel = relativeDate(result.updatedAt);
  const issueTypeForIcon = (result.issueType ?? "task").toLowerCase() as IssueType;
  // Sprint names resolved in API; sprintNameMap is a client-side fallback
  const displaySprintName = result.sprintName
    ? (sprintNameMap?.[result.sprintName] ?? result.sprintName)
    : null;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Row 1: sprint / epic / key breadcrumb — all chips are links */}
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        {displaySprintName && result.sprintId && (
          <>
            <a
              href={`/sprint-board?sprint=${encodeURIComponent(result.sprintId)}`}
              onClick={onClose}
              className="flex items-center gap-1 cursor-pointer"
              style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", transition: "color 120ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              <IterationCw className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "#d4904a" }} />
              <span className="truncate max-w-[160px]" title={displaySprintName}>{displaySprintName}</span>
            </a>
            <span className="text-white/15">/</span>
          </>
        )}
        {result.epic && (
          <>
            {result.epicKey ? (
              <a
                href={`/tickets/${result.epicKey}`}
                onClick={onClose}
                className="flex items-center gap-1 cursor-pointer"
                style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", transition: "color 120ms" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
              >
                <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "#9b6cd4" }} />
                <span className="truncate max-w-[160px]" title={result.epic}>{result.epic}</span>
              </a>
            ) : (
              <span className="flex items-center gap-1 text-white/40">
                <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "#9b6cd4" }} />
                <span className="truncate max-w-[160px]" title={result.epic}>{result.epic}</span>
              </span>
            )}
            <span className="text-white/15">/</span>
          </>
        )}
        {/* Key chip */}
        <a
          href={`/tickets/${result.key}`}
          onClick={onClose}
          className="flex items-center gap-1 cursor-pointer"
          style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", transition: "color 120ms" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
        >
          <span className="shrink-0">
            <IssueTypeIcon type={issueTypeForIcon} size={13} />
          </span>
          <span className="font-mono">{result.key}</span>
        </a>
      </div>

      {/* Summary */}
      <h3 className="text-[14px] font-medium leading-snug text-white/90">
        {result.summary}
      </h3>

      {/* Row 2: status + jira button + updated date */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={result.status} />
        {result.jiraUrl && (
          <a
            href={result.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer"
            style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", color: "#60a5fa", transition: "background-color 120ms" }}
          >
            Jira
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
          </a>
        )}
        {updatedLabel && (
          <span className="text-[11px] text-white/20">{updatedLabel}</span>
        )}
      </div>

      {/* Reporter + Assignee + story points */}
      {(result.reporter || result.assignee || result.storyPoints != null) && (
        <div className="flex items-center gap-4 text-[11px]">
          {result.reporter && (
            <span className="flex items-center gap-1.5">
              <span className="text-white/25 uppercase tracking-wide">By</span>
              <span className="text-white/55">{result.reporter}</span>
            </span>
          )}
          {result.assignee && (
            <span className="flex items-center gap-1.5">
              <span className="text-white/25 uppercase tracking-wide">Assigned</span>
              <span className="text-white/55">{result.assignee}</span>
            </span>
          )}
          {result.storyPoints != null && (
            <span className="flex items-center gap-1.5">
              <span className="text-white/25 uppercase tracking-wide">Points</span>
              <span className="text-white/55">{result.storyPoints}</span>
            </span>
          )}
        </div>
      )}

      {/* Meta: labels */}
      {result.labels && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <span className="text-[11px] text-white/30 uppercase tracking-wide">Labels</span>
          <span className="text-[12px] text-white/65">{result.labels}</span>
        </div>
      )}

      {/* Description — plain, no card, divider above */}
      {result.description ? (
        <div className="description-content border-t border-white/[0.06] pt-3" style={{ zoom: 0.8 }}>
          {renderMarkdown(result.description)}
        </div>
      ) : (
        <p className="text-[12px] text-white/20 italic">No description</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match highlight
// ---------------------------------------------------------------------------

function HighlightedText({ text, matches, fieldName }: { text: string; matches?: readonly FuseResultMatch[]; fieldName: string }) {
  const summaryMatch = matches?.find((m) => m.key === fieldName && m.value === text);
  if (!summaryMatch || !summaryMatch.indices || summaryMatch.indices.length === 0) {
    return <span>{text}</span>;
  }
  const intervals = [...summaryMatch.indices].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of intervals) {
    if (start > cursor) parts.push(<span key={cursor}>{text.slice(cursor, start)}</span>);
    parts.push(
      <mark key={start} className="rounded-[2px] px-[1px]" style={{ backgroundColor: "rgba(74, 170, 96, 0.18)", color: "#7ac48a", textDecoration: "none" }}>
        {text.slice(start, end + 1)}
      </mark>
    );
    cursor = end + 1;
  }
  if (cursor < text.length) parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
  return <span>{parts}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow({ idx }: { idx: number }) {
  const widths = ["w-48", "w-56", "w-40", "w-52", "w-44"];
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <div className={`h-3 animate-pulse rounded bg-white/[0.06] ${widths[idx % widths.length]}`} />
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
  sprintNameMap,
  showKey,
}: {
  result: LocalSearchResult;
  active: boolean;
  /** Called on both regular and cmd click; `newTab` true means cmd/ctrl+click */
  onSelect: (newTab: boolean) => void;
  onHover: () => void;
  sprintNameMap?: Record<string, string>;
  showKey: boolean;
}) {
  const displaySprintName = result.sprintName
    ? (sprintNameMap?.[result.sprintName] ?? result.sprintName)
    : null;

  return (
    <a
      href={`/tickets/${result.key}`}
      onClick={(e) => {
        const newTab = e.metaKey || e.ctrlKey;
        if (!newTab) e.preventDefault();
        onSelect(newTab);
      }}
      onMouseMove={onHover}
      className="group relative flex w-full items-center gap-3 px-6 py-3.5 focus-visible:outline-none"
      style={{
        display: "flex",
        textDecoration: "none",
        backgroundColor: active ? "rgba(74, 170, 96, 0.06)" : undefined,
        borderLeft: active ? "2px solid var(--color-brand-400)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {!active && (
        <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(255,255,255,0.025)" }} />
      )}
      <span className="min-w-0 flex-1 truncate text-[14px] text-white/75">
        <HighlightedText text={result.summary} matches={result.matches} fieldName="summary" />
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {(showKey || displaySprintName) && (
          <span className="hidden sm:flex items-center gap-1.5">
            {showKey && (
              <span className="font-mono text-[11px] text-white/45 tracking-tight">{result.key}</span>
            )}
            {showKey && displaySprintName && (
              <span className="text-white/15 text-[11px]">·</span>
            )}
            {displaySprintName && (
              <span className="text-[11px] text-white/20 truncate max-w-[140px]">{displaySprintName}</span>
            )}
          </span>
        )}
        <StatusBadge status={result.status} />
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Jira result row
// ---------------------------------------------------------------------------

function JiraResultRow({
  issue, active, onSelect, onHover, showKey,
}: {
  issue: JiraSearchResult;
  active: boolean;
  onSelect: (newTab: boolean) => void;
  onHover: () => void;
  showKey: boolean;
}) {
  return (
    <a
      href={`/tickets/${issue.key}`}
      onClick={(e) => {
        const newTab = e.metaKey || e.ctrlKey;
        if (!newTab) e.preventDefault();
        onSelect(newTab);
      }}
      onMouseMove={onHover}
      className="group relative flex w-full items-center gap-3 px-6 py-3.5 focus-visible:outline-none"
      style={{
        display: "flex",
        textDecoration: "none",
        backgroundColor: active ? "rgba(74, 170, 96, 0.06)" : undefined,
        borderLeft: active ? "2px solid var(--color-brand-400)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {!active && (
        <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(255,255,255,0.025)" }} />
      )}
      <span className="min-w-0 flex-1 truncate text-[14px] text-white/75">{issue.summary}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {(showKey || issue.sprintName) && (
          <span className="hidden sm:flex items-center gap-1.5">
            {showKey && (
              <span className="font-mono text-[11px] text-white/45 tracking-tight">{issue.key}</span>
            )}
            {showKey && issue.sprintName && (
              <span className="text-white/15 text-[11px]">·</span>
            )}
            {issue.sprintName && (
              <span className="text-[11px] text-white/20 truncate max-w-[140px]">{issue.sprintName}</span>
            )}
          </span>
        )}
        <StatusBadge status={issue.status} />
        {issue.url && (
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer"
            style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", color: "#60a5fa", transition: "background-color 120ms" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(96, 165, 250, 0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(96, 165, 250, 0.1)")}
          >
            Open in Jira
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
          </a>
        )}
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ query, mode }: { query: string; mode: SearchMode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
        <Search className="h-4 w-4 text-white/20" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-white/30">
        {query.length < 2
          ? "Type at least 2 characters to search"
          : mode === "local" ? `No tickets matched "${query}"` : `No Jira results for "${query}"`}
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

export function SearchModal({ open, initialQuery = "", onClose, onSelectTicket, sprintNameMap }: SearchModalProps) {
  const router = useRouter();

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
  const [activeIdx, setActiveIdx] = useState(-1);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(520);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>("list");

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(520);

  // Drag-to-resize preview pane
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

  // Reset panel focus when preview closes
  useEffect(() => {
    if (!previewEnabled || activeIdx < 0) setFocusedPanel("list");
  }, [previewEnabled, activeIdx]);

  // On open: restore previous search state; only reset if a specific initialQuery is provided
  useEffect(() => {
    if (open) {
      if (initialQuery) {
        setQuery(initialQuery);
        setLocalResults([]);
        setJiraResults([]);
        setJiraError(null);
        setActiveIdx(-1);
        setFocusedPanel("list");
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialQuery]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onClose]);

  // Local search with debounce
  const runLocalSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setLocalResults([]); return; }
    if (localAbortRef.current) localAbortRef.current.abort();
    localAbortRef.current = new AbortController();
    const { signal } = localAbortRef.current;
    setLoadingLocal(true);
    try {
      const res = await fetch(`/api/search/local?q=${encodeURIComponent(q)}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setLocalResults(data.results ?? []);
        setActiveIdx(-1);
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

  // Keyboard navigation
  const resultCount = mode === "local" ? localResults.length : jiraResults.length;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Preview panel focused: up/down scrolls description, left returns to list
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

    // List panel navigation
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(activeIdx + 1, resultCount - 1);
      setActiveIdx(next);
      if (mode === "local" && next >= 0) setPreviewEnabled(true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(activeIdx - 1, 0);
      setActiveIdx(next);
      if (mode === "local" && next >= 0) setPreviewEnabled(true);
      return;
    }
    if (e.key === "ArrowRight" && mode === "local" && previewEnabled && activeIdx >= 0) {
      e.preventDefault();
      setFocusedPanel("preview");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "local") {
        const result = localResults[activeIdx];
        if (result) {
          if (e.shiftKey) {
            // Shift+Enter: open in new tab, keep modal open and refocus current window
            window.open(`/tickets/${result.key}`, "_blank", "noopener,noreferrer");
            window.focus();
          } else {
            router.push(`/tickets/${result.key}`);
            onClose();
          }
        }
      } else {
        if (loadingJira) return;
        if (jiraResults.length > 0) {
          const issue = jiraResults[activeIdx];
          if (issue) { router.push(`/tickets/${issue.key}`); onClose(); }
        } else {
          runJiraSearch();
        }
      }
    }
  }, [focusedPanel, activeIdx, resultCount, mode, localResults, jiraResults, previewEnabled, loadingJira, onClose, onSelectTicket, runJiraSearch, router]);

  // Scroll active row into view
  useEffect(() => {
    if (activeIdx < 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[data-result-row]");
    const row = rows[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const displayQuery = mode === "local" ? query : (jiraQuery || query);
  const showLocalSkeleton = loadingLocal && mode === "local";
  const showJiraSkeleton = loadingJira && mode === "jira";
  const showPreview = previewEnabled && mode === "local" && localResults.length > 0 && activeIdx >= 0;
  const activeResult = showPreview ? localResults[activeIdx] : null;

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
        {/* Search input + mode toggle */}
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
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 cursor-pointer hover:text-white/60 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:text-white/80"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Jira mode controls */}
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
              className="ml-auto rounded px-3 py-1 text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              {loadingJira ? "Searching..." : "Search"}
            </button>
          </div>
        )}

        {/* Results area */}
        <div className="flex" style={{ minHeight: showPreview ? 340 : undefined }}>
          {/* Results list */}
          <div
            ref={listRef}
            className="overflow-y-auto flex-1"
            style={{
              maxHeight: 500,
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
            {!showLocalSkeleton && mode === "local" && localResults.length > 0 && (
              <div>
                {localResults.map((r, i) => (
                  <div key={r.key} data-result-row="">
                    <LocalResultRow
                      result={r}
                      active={i === activeIdx}
                      onSelect={(newTab) => {
                        if (newTab) {
                          // CMD/Ctrl+click: open in new tab, keep modal open
                          window.open(`/tickets/${r.key}`, "_blank", "noopener,noreferrer");
                          window.focus();
                        } else {
                          router.push(`/tickets/${r.key}`);
                          onClose();
                        }
                      }}
                      onHover={() => setActiveIdx(i)}
                      sprintNameMap={sprintNameMap}
                      showKey={!showPreview}
                    />
                  </div>
                ))}
              </div>
            )}
            {!showJiraSkeleton && mode === "jira" && jiraResults.length > 0 && (
              <div>
                {jiraResults.map((issue, i) => (
                  <div key={issue.key} data-result-row="">
                    <JiraResultRow
                      issue={issue}
                      active={i === activeIdx}
                      onSelect={(newTab) => {
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
            {!showLocalSkeleton && !showJiraSkeleton && !jiraError && (
              (mode === "local" && localResults.length === 0) ||
              (mode === "jira" && jiraResults.length === 0 && !loadingJira)
            ) && <EmptyState query={displayQuery} mode={mode} />}
          </div>

          {/* Drag handle + Preview pane */}
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
                  maxHeight: 500,
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

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-6 py-3 text-[10px] text-white/20">
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">↵</kbd> open</span>
          {mode === "local" && previewEnabled && activeIdx >= 0 && (
            <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">→</kbd> preview</span>
          )}
          {focusedPanel === "preview" && (
            <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">←</kbd> list</span>
          )}
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">⇧↵</kbd> new tab</span>
          <span><kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono">esc</kbd> close</span>
          <div className="flex-1" />
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
      `}</style>
    </div>
  );
}
