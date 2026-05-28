"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sanitizeHtmlClient } from "@/lib/sanitize-client";
import {
  BookOpen,
  Plus,
  X,
  ExternalLink,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
  User,
  AlertCircle,
} from "lucide-react";
import { useTicketConfluenceLinks } from "@/hooks/useSprintBoard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import useSWR from "swr";
import type { ConfluenceSearchResult } from "@/lib/confluence-client";
import { swrFetcher, tickets } from "@/lib/api-client";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Page preview (Phase 3)
// ---------------------------------------------------------------------------

function PagePreview({ pageId, pageUrl }: { pageId: string; pageUrl: string }) {
  const { data, isLoading } = useSWR<{
    pageId: string;
    title: string;
    bodyHtml: string;
    lastModifiedAt: string | null;
    lastModifiedBy: string | null;
    url: string;
    truncated: boolean;
  }>(
    `/api/confluence/pages/${encodeURIComponent(pageId)}`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 120000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-3">
        <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-text-muted" />
        <span className="text-body-sm text-text-muted">Loading preview...</span>
      </div>
    );
  }

  if (!data?.bodyHtml) {
    return (
      <div className="flex items-center gap-2 py-3 px-3">
        <AlertCircle size={12} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-body-sm text-text-muted">Preview not available</span>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Meta line */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-text-muted">
        {data.lastModifiedBy && (
          <span className="flex items-center gap-1">
            <User size={10} strokeWidth={1.5} />
            {data.lastModifiedBy}
          </span>
        )}
        {data.lastModifiedAt && (
          <span className="flex items-center gap-1">
            <Clock size={10} strokeWidth={1.5} />
            {relativeDate(data.lastModifiedAt)}
          </span>
        )}
      </div>

      {/* Rendered HTML preview */}
      <div
        className="confluence-preview text-body-sm leading-relaxed text-text-secondary"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlClient(data.bodyHtml) }}
      />

      {data.truncated && (
        <p className="mt-2 text-label text-text-muted">Preview truncated to 500 words.</p>
      )}

      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-label text-[var(--color-brand-400)]/70 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "color 0.15s ease" }}
      >
        Open in Confluence
        <ExternalLink size={10} strokeWidth={1.5} />
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search popover
// ---------------------------------------------------------------------------

function SearchPopover({
  onSelect,
  onClose,
}: {
  onSelect: (result: ConfluenceSearchResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{ results: ConfluenceSearchResult[] }>(
    debouncedQuery.length >= 2 ? `/api/confluence/search?q=${encodeURIComponent(debouncedQuery)}` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]"
      style={{ minWidth: 240 }}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-border-default px-3 py-2.5">
        <Search size={13} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Confluence pages..."
          className="flex-1 bg-transparent text-body-lg text-text-secondary placeholder:text-text-muted focus:outline-none"
        />
        {isLoading && (
          <Loader2 size={12} strokeWidth={1.5} className="shrink-0 animate-spin text-text-muted" />
        )}
      </div>

      {/* Results */}
      <div className="max-h-48 overflow-y-auto py-1">
        {!debouncedQuery || debouncedQuery.length < 2 ? (
          <p className="px-3 py-2 text-body-sm text-text-muted">Type at least 2 characters to search</p>
        ) : data?.results?.length === 0 ? (
          <p className="px-3 py-2 text-body-sm text-text-muted">No pages found</p>
        ) : (
          data?.results?.map((r) => (
            <button
              key={r.pageId}
              type="button"
              onClick={() => onSelect(r)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left cursor-pointer hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <FileText size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-text-secondary">{r.title}</p>
                <p className="mt-0.5 text-label text-text-muted">{r.spaceTitle}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mentioned pages (Phase 4)
// ---------------------------------------------------------------------------

type MentionedPage = {
  pageId: string;
  title: string;
  url: string;
  source: "description" | "comment";
};

function MentionedPagesSection({
  ticketKey,
  linkedPageIds,
  onLink,
}: {
  ticketKey: string;
  linkedPageIds: Set<string>;
  onLink: (page: MentionedPage) => void;
}) {
  const { data, isLoading } = useSWR<{ mentions: MentionedPage[] }>(
    `/api/tickets/${encodeURIComponent(ticketKey)}/confluence-mentions`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const unlinkedMentions = data?.mentions?.filter((m) => !linkedPageIds.has(m.pageId)) ?? [];

  if (isLoading) return null;
  if (unlinkedMentions.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
        Mentioned
      </p>
      <div className="space-y-1">
        {unlinkedMentions.map((m) => (
          <div key={m.pageId} className="flex items-center gap-2">
            <FileText size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-label text-text-tertiary">{m.title}</span>
            <button
              type="button"
              onClick={() => onLink(m)}
              className="shrink-0 rounded px-1.5 py-0.5 text-caption text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
            >
              Link
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConfluencePagesSection({
  ticketKey,
  variant = "default",
  hideWhenEmpty = false,
}: {
  ticketKey: string;
  variant?: "default" | "compact";
  hideWhenEmpty?: boolean;
}) {
  const { data, mutate } = useTicketConfluenceLinks(ticketKey);
  const [showSearch, setShowSearch] = useState(false);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [compactExpanded, setCompactExpanded] = useState(false);
  const searchAnchorRef = useRef<HTMLDivElement>(null);

  const links = data?.links ?? [];
  const linkedPageIds = new Set(links.map((l) => l.pageId));

  const handleSelect = useCallback(async (result: ConfluenceSearchResult) => {
    setShowSearch(false);
    try {
      await tickets.addConfluenceLink(ticketKey, {
        pageId: result.pageId,
        pageTitle: result.title,
        pageUrl: result.url,
        lastModifiedAt: result.lastModified,
        source: "manual",
      });
      await mutate();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, mutate]);

  const handleLinkMention = useCallback(async (page: MentionedPage) => {
    try {
      await tickets.addConfluenceLink(ticketKey, {
        pageId: page.pageId,
        pageTitle: page.title,
        pageUrl: page.url,
        source: "auto-detected",
      });
      await mutate();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, mutate]);

  const handleUnlink = useCallback(async (linkId: string) => {
    try {
      await tickets.removeConfluenceLink(ticketKey, { linkId });
      await mutate();
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey, mutate]);

  const togglePagePreview = useCallback((pageId: string) => {
    setExpandedPageId((prev) => (prev === pageId ? null : pageId));
  }, []);

  if (hideWhenEmpty && links.length === 0) return null;

  const compactBody = variant === "compact" ? compactExpanded : true;

  return (
    <div className={variant === "compact" ? "" : "mt-8"}>
      {variant === "compact" ? (
        <button
          type="button"
          onClick={() => setCompactExpanded(!compactExpanded)}
          aria-expanded={compactExpanded}
          className="flex w-full items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <div className="flex items-center gap-1.5">
            <h3 className="shrink-0 text-label font-semibold uppercase tracking-wider text-text-muted">
              Confluence
            </h3>
            <span className="text-caption text-text-muted">({links.length})</span>
          </div>
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={`shrink-0 text-text-muted ${compactExpanded ? "" : "-rotate-90"}`}
            style={{ transition: "transform 0.2s ease" }}
          />
        </button>
      ) : (
        <SectionHeader title="Confluence" count={links.length} />
      )}

      {compactBody && (
      <div className={variant === "compact" ? "mt-2 space-y-1.5" : "mt-3 space-y-1.5"}>
          {/* Linked pages */}
          {links.length === 0 && (
            <p className="py-1 text-body-sm text-text-muted">No pages linked yet</p>
          )}

          {links.map((link) => (
            <div key={link.id} className="group/link rounded-lg border border-border-subtle bg-overlay-subtle">
              {/* Page row */}
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => togglePagePreview(link.pageId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  title="Expand preview"
                >
                  {expandedPageId === link.pageId ? (
                    <ChevronDown size={11} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                  ) : (
                    <ChevronRight size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                  )}
                  <BookOpen size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                  <span className="truncate text-body-sm text-text-secondary group-hover/link:text-text-secondary" style={{ transition: "color 0.15s ease" }}>
                    {link.pageTitle}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover/link:opacity-100" style={{ transition: "opacity 0.15s ease" }}>
                  <a
                    href={link.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-text-muted cursor-pointer hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "color 0.15s ease" }}
                    title="Open in Confluence"
                  >
                    <ExternalLink size={11} strokeWidth={1.5} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleUnlink(link.id)}
                    className="rounded p-0.5 text-text-muted cursor-pointer hover:text-[var(--color-status-error)]/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "color 0.15s ease" }}
                    title="Unlink page"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Inline preview */}
              {expandedPageId === link.pageId && (
                <div className="border-t border-border-subtle">
                  <PagePreview pageId={link.pageId} pageUrl={link.pageUrl} />
                </div>
              )}
            </div>
          ))}

          {/* Link button + search popover */}
          <div ref={searchAnchorRef} className="relative">
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 py-1.5 text-body-sm text-text-tertiary w-full cursor-pointer hover:border-[var(--color-brand-500)]/40 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "border-color 0.15s ease, color 0.15s ease" }}
            >
              <Plus size={12} strokeWidth={1.5} />
              Link Confluence page
            </button>

            {showSearch && (
              <SearchPopover
                onSelect={handleSelect}
                onClose={() => setShowSearch(false)}
              />
            )}
          </div>

          {/* Mentioned pages (auto-detected) */}
          <MentionedPagesSection
            ticketKey={ticketKey}
            linkedPageIds={linkedPageIds}
            onLink={handleLinkMention}
          />
      </div>
      )}
    </div>
  );
}
