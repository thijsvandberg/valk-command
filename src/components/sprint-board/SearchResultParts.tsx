"use client";

import { Search, ExternalLink, IterationCw, Zap, ChevronRight, MessageSquare, FileText } from "lucide-react";
import type { FuseResultMatch } from "fuse.js";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/app/api/search/local/route";
import type { JiraSearchResult } from "@/app/api/search/jira/route";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { IssueType } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";

export type SearchMode = "local" | "jira";
export type FocusedPanel = "list" | "preview";

export function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const color = JIRA_STATUS_COLORS[upper as keyof typeof JIRA_STATUS_COLORS] ?? { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-caption font-medium tracking-wide"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {upper}
    </span>
  );
}

export function relativeDate(isoString: string | null): string | null {
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

export function PreviewPane({
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
  const displaySprintName = result.sprintName
    ? (sprintNameMap?.[result.sprintName] ?? result.sprintName)
    : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap text-body-sm">
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

      <h3 className="text-body-lg font-medium leading-snug text-white/90">
        {result.summary}
      </h3>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={result.status} />
        {result.jiraUrl && (
          <a
            href={result.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-0.5 text-label font-medium cursor-pointer"
            style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", color: "#60a5fa", transition: "background-color 120ms" }}
          >
            Jira
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
          </a>
        )}
        {updatedLabel && (
          <span className="text-label text-white/20">{updatedLabel}</span>
        )}
      </div>

      {(result.reporter || result.assignee || result.storyPoints != null) && (
        <div className="flex items-center gap-4 text-label">
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

      {result.labels && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <span className="text-label text-white/30 uppercase tracking-wide">Labels</span>
          <span className="text-body-sm text-white/65">{result.labels}</span>
        </div>
      )}

      {result.description ? (
        <div className="description-content border-t border-border-default pt-3" style={{ zoom: 0.8 }}>
          {renderMarkdown(result.description)}
        </div>
      ) : (
        <p className="text-body-sm text-white/20 italic">No description</p>
      )}
    </div>
  );
}

// Merges Fuse match index pairs that are within `gap` characters of each other, then drops
// spans shorter than `minLength`. This removes the scattered single/double-char highlights
// Fuse produces for fuzzy character-level matches.
function mergeAndFilterIndices(
  raw: readonly [number, number][],
  mergeGap = 1,
  minLength = 3,
): [number, number][] {
  if (raw.length === 0) return [];
  const sorted = [...raw].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1] + mergeGap + 1) {
      merged[merged.length - 1][1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged.filter(([s, e]) => e - s + 1 >= minLength);
}

export function HighlightedText({ text, matches, fieldName }: { text: string; matches?: readonly FuseResultMatch[]; fieldName: string }) {
  const summaryMatch = matches?.find((m) => m.key === fieldName && m.value === text);
  if (!summaryMatch || !summaryMatch.indices || summaryMatch.indices.length === 0) {
    return <span>{text}</span>;
  }
  const intervals = mergeAndFilterIndices(summaryMatch.indices as [number, number][]);
  if (intervals.length === 0) return <span>{text}</span>;
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

// Fields that indicate the match was in a body content area (not the primary title shown in the row)
const BODY_FIELDS = ["description", "acceptanceCriteria", "localEditDescription", "notes"];

// Field labels displayed in the snippet prefix
const BODY_FIELD_LABELS: Record<string, string> = {
  description: "Desc",
  acceptanceCriteria: "AC",
  localEditDescription: "Local",
  notes: "Notes",
};

// Extracts a short window of text around the first Fuse match for a body field and renders it with inline highlights.
// Uses match.value (provided by Fuse when includeMatches:true) so no need to pass field values separately.
export function MatchSnippet({ matches }: { matches?: readonly FuseResultMatch[] }) {
  if (!matches) return null;

  for (const fieldName of BODY_FIELDS) {
    const match = matches.find((m) => m.key === fieldName && m.indices && m.indices.length > 0 && m.value);
    if (!match || !match.value) continue;

    const value = match.value;
    const cleanedIndices = mergeAndFilterIndices(match.indices as [number, number][]);
    if (cleanedIndices.length === 0) continue;

    // Build a ~120-char window around the first meaningful match
    const WINDOW = 120;
    const BEFORE = 40;
    const [firstStart] = cleanedIndices[0];
    const windowStart = Math.max(0, firstStart - BEFORE);
    const windowEnd = Math.min(value.length, windowStart + WINDOW);
    const snippet = value.slice(windowStart, windowEnd);

    // Re-map match indices relative to the window start
    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const [start, end] of cleanedIndices) {
      const relStart = start - windowStart;
      const relEnd = end - windowStart;
      if (relEnd <= 0 || relStart >= snippet.length) continue;

      const clampedStart = Math.max(0, relStart);
      const clampedEnd = Math.min(snippet.length, relEnd + 1);

      if (clampedStart > cursor) {
        parts.push(<span key={cursor}>{snippet.slice(cursor, clampedStart)}</span>);
      }
      parts.push(
        <mark
          key={start}
          className="rounded-[2px] px-[1px]"
          style={{ backgroundColor: "rgba(74, 170, 96, 0.18)", color: "#7ac48a", textDecoration: "none" }}
        >
          {snippet.slice(clampedStart, clampedEnd)}
        </mark>
      );
      cursor = clampedEnd;
    }
    if (cursor < snippet.length) parts.push(<span key={cursor}>{snippet.slice(cursor)}</span>);

    const label = BODY_FIELD_LABELS[fieldName] ?? fieldName;

    return (
      <span className="block truncate text-label leading-snug" style={{ color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
        <span className="mr-1 uppercase tracking-wide text-caption" style={{ color: "rgba(255,255,255,0.2)" }}>{label}</span>
        {windowStart > 0 && <span style={{ color: "rgba(255,255,255,0.2)" }}>…</span>}
        {parts}
        {windowEnd < value.length && <span style={{ color: "rgba(255,255,255,0.2)" }}>…</span>}
      </span>
    );
  }

  return null;
}

// Returns true when the result has a meaningful match (≥3 chars after merging) in a body field
function hasBodyFieldMatch(matches?: readonly FuseResultMatch[]): boolean {
  if (!matches) return false;
  return matches.some(
    (m) => m.key && BODY_FIELDS.includes(m.key) && m.indices && mergeAndFilterIndices(m.indices as [number, number][]).length > 0,
  );
}

export function SkeletonRow({ idx }: { idx: number }) {
  const widths = ["w-48", "w-56", "w-40", "w-52", "w-44"];
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <div className={`h-3 animate-pulse rounded bg-white/[0.06] ${widths[idx % widths.length]}`} />
      <div className="ml-auto h-4 w-14 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

export function LocalResultRow({
  result,
  active,
  onSelect,
  onHover,
  sprintNameMap,
  showKey,
}: {
  result: LocalSearchResult;
  active: boolean;
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
      <span className="min-w-0 flex-1 overflow-hidden text-body-lg text-white/75">
        <HighlightedText text={result.summary} matches={result.matches} fieldName="summary" />
        {hasBodyFieldMatch(result.matches) && <MatchSnippet matches={result.matches} />}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {(showKey || displaySprintName) && (
          <span className="hidden sm:flex items-center gap-1.5">
            {showKey && (
              <span className="font-mono text-label text-white/45 tracking-tight">{result.key}</span>
            )}
            {showKey && displaySprintName && (
              <span className="text-white/15 text-label">·</span>
            )}
            {displaySprintName && (
              <span className="text-label text-white/20 truncate max-w-[140px]">{displaySprintName}</span>
            )}
          </span>
        )}
        <StatusBadge status={result.status} />
      </span>
    </a>
  );
}

export function JiraResultRow({
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
      <span className="min-w-0 flex-1 truncate text-body-lg text-white/75">{issue.summary}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {(showKey || issue.sprintName) && (
          <span className="hidden sm:flex items-center gap-1.5">
            {showKey && (
              <span className="font-mono text-label text-white/45 tracking-tight">{issue.key}</span>
            )}
            {showKey && issue.sprintName && (
              <span className="text-white/15 text-label">·</span>
            )}
            {issue.sprintName && (
              <span className="text-label text-white/20 truncate max-w-[140px]">{issue.sprintName}</span>
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
            className="flex items-center gap-1 rounded px-2 py-0.5 text-label font-medium cursor-pointer"
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

export function EmptyState({ query, mode, onSwitchToJira }: { query: string; mode: SearchMode; onSwitchToJira?: () => void }) {
  const hasQuery = query.length >= 2;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
        <Search className="h-4 w-4 text-white/20" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-white/30">
        {!hasQuery
          ? "Type at least 2 characters to search"
          : mode === "local" ? `No results matched "${query}"` : `No Jira results for "${query}"`}
      </p>
      {hasQuery && mode === "local" && onSwitchToJira && (
        <button
          type="button"
          onClick={onSwitchToJira}
          className="rounded-full px-3 py-1.5 text-body-sm font-medium cursor-pointer"
          style={{
            backgroundColor: "rgba(74, 170, 96, 0.1)",
            color: "var(--color-brand-400)",
            border: "1px solid rgba(74, 170, 96, 0.2)",
            transition: "background-color 120ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(74, 170, 96, 0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(74, 170, 96, 0.1)")}
        >
          Search in Jira mode
        </button>
      )}
    </div>
  );
}

const INITIAL_SECTION_LIMIT = 5;

export function GroupedResultSection({
  label,
  count,
  collapsed,
  onToggle,
  showAll,
  onShowMore,
  initialLimit = INITIAL_SECTION_LIMIT,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  showAll: boolean;
  onShowMore: () => void;
  initialLimit?: number;
  children: React.ReactNode;
}) {
  const hasMore = !showAll && count > initialLimit;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Toggle ${label} section`}
        className="flex w-full items-center gap-2 px-5 py-2 cursor-pointer focus-visible:outline-none"
        style={{
          backgroundColor: "rgba(255,255,255,0.025)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <ChevronRight
          className="h-3 w-3 shrink-0"
          strokeWidth={2}
          style={{
            color: "rgba(255,255,255,0.3)",
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 150ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        <span className="text-label font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          {label}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-caption font-medium"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}
        >
          {count}
        </span>
      </button>

      {!collapsed && (
        <>
          {children}
          {hasMore && (
            <button
              type="button"
              onClick={onShowMore}
              className="flex w-full items-center justify-center px-6 py-2 text-label cursor-pointer focus-visible:outline-none"
              style={{ color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              Show {count - initialLimit} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

function relativeCreatedAt(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function ConversationResultRow({
  result,
  active,
  onSelect,
  onHover,
}: {
  result: ConversationSearchResult;
  active: boolean;
  onSelect: (newTab: boolean) => void;
  onHover: () => void;
}) {
  return (
    <a
      href={`/chat/${result.id}`}
      onClick={(e) => {
        const newTab = e.metaKey || e.ctrlKey;
        if (!newTab) e.preventDefault();
        onSelect(newTab);
      }}
      onMouseMove={onHover}
      className="group relative flex w-full items-center gap-3 px-6 py-3 focus-visible:outline-none"
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
      <MessageSquare className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.2)" }} />
      <span className="min-w-0 flex-1 truncate text-body text-white/70">
        {result.title}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {result.relatedTicket && (
          <span className="font-mono text-label text-white/30 tracking-tight">{result.relatedTicket}</span>
        )}
        <span
          className="rounded px-1.5 py-0.5 text-caption font-medium capitalize"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}
        >
          {result.type}
        </span>
        <span className="text-caption text-white/20">{relativeCreatedAt(result.createdAt)}</span>
      </span>
    </a>
  );
}

export function CommentResultRow({
  result,
  active,
  onSelect,
  onHover,
}: {
  result: CommentSearchResult;
  active: boolean;
  onSelect: (newTab: boolean) => void;
  onHover: () => void;
}) {
  return (
    <a
      href={`/tickets/${result.ticketKey}`}
      onClick={(e) => {
        const newTab = e.metaKey || e.ctrlKey;
        if (!newTab) e.preventDefault();
        onSelect(newTab);
      }}
      onMouseMove={onHover}
      className="group relative flex w-full items-start gap-3 px-6 py-3 focus-visible:outline-none"
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
      <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.2)" }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-white/70">{result.content}</span>
        <span className="text-label text-white/30">{result.author}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 pt-0.5">
        <span className="font-mono text-label text-white/35 tracking-tight">{result.ticketKey}</span>
        <span
          className="rounded px-1.5 py-0.5 text-caption font-medium"
          style={{
            backgroundColor: result.source === "jira" ? "rgba(96, 165, 250, 0.1)" : "rgba(74, 170, 96, 0.1)",
            color: result.source === "jira" ? "#60a5fa" : "var(--color-brand-400)",
          }}
        >
          {result.source === "jira" ? "Jira" : "PO"}
        </span>
      </span>
    </a>
  );
}
