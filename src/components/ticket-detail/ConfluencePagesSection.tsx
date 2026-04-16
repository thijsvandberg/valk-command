"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
        <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-white/20" />
        <span className="text-xs text-white/25">Loading preview...</span>
      </div>
    );
  }

  if (!data?.bodyHtml) {
    return (
      <div className="flex items-center gap-2 py-3 px-3">
        <AlertCircle size={12} strokeWidth={1.5} className="text-white/20" />
        <span className="text-xs text-white/25">Preview not available</span>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Meta line */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/25">
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
        className="confluence-preview text-xs leading-relaxed text-white/50"
        /* Sanitized server-side before reaching here */
        dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
      />

      {data.truncated && (
        <p className="mt-2 text-[11px] text-white/20">Preview truncated to 500 words.</p>
      )}

      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-brand-400)]/70 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      style={{ minWidth: 240 }}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <Search size={13} strokeWidth={1.5} className="shrink-0 text-white/25" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Confluence pages..."
          className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 focus:outline-none"
        />
        {isLoading && (
          <Loader2 size={12} strokeWidth={1.5} className="shrink-0 animate-spin text-white/25" />
        )}
      </div>

      {/* Results */}
      <div className="max-h-48 overflow-y-auto py-1">
        {!debouncedQuery || debouncedQuery.length < 2 ? (
          <p className="px-3 py-2 text-xs text-white/25">Type at least 2 characters to search</p>
        ) : data?.results?.length === 0 ? (
          <p className="px-3 py-2 text-xs text-white/25">No pages found</p>
        ) : (
          data?.results?.map((r) => (
            <button
              key={r.pageId}
              type="button"
              onClick={() => onSelect(r)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left cursor-pointer hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <FileText size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-white/20" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/65">{r.title}</p>
                <p className="mt-0.5 text-[11px] text-white/25">{r.spaceTitle}</p>
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
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/20">
        Mentioned
      </p>
      <div className="space-y-1">
        {unlinkedMentions.map((m) => (
          <div key={m.pageId} className="flex items-center gap-2">
            <FileText size={11} strokeWidth={1.5} className="shrink-0 text-white/15" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/35">{m.title}</span>
            <button
              type="button"
              onClick={() => onLink(m)}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-white/30 cursor-pointer hover:bg-white/[0.06] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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

export function ConfluencePagesSection({ ticketKey }: { ticketKey: string }) {
  const { data, mutate } = useTicketConfluenceLinks(ticketKey);
  const [expanded, setExpanded] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
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

  return (
    <div>
      {/* Section header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); }
        }}
        className="flex w-full items-center justify-between cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">
            Confluence
          </h3>
          {links.length > 0 && (
            <span className="text-[10px] text-white/15">
              {links.length} page{links.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`shrink-0 text-white/20 ${expanded ? "" : "-rotate-90"}`}
          style={{ transition: "transform 0.2s ease" }}
        />
      </div>

      {expanded && (
        <div className="mt-2 space-y-1">
          {/* Linked pages */}
          {links.length === 0 && (
            <p className="py-1 text-xs text-white/20">No pages linked yet</p>
          )}

          {links.map((link) => (
            <div key={link.id} className="group/link rounded-lg border border-white/[0.04] bg-white/[0.01]">
              {/* Page row */}
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => togglePagePreview(link.pageId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  title="Expand preview"
                >
                  {expandedPageId === link.pageId ? (
                    <ChevronDown size={11} strokeWidth={1.5} className="shrink-0 text-white/30" />
                  ) : (
                    <ChevronRight size={11} strokeWidth={1.5} className="shrink-0 text-white/20" />
                  )}
                  <BookOpen size={11} strokeWidth={1.5} className="shrink-0 text-white/20" />
                  <span className="truncate text-xs text-white/55 group-hover/link:text-white/70" style={{ transition: "color 0.15s ease" }}>
                    {link.pageTitle}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover/link:opacity-100" style={{ transition: "opacity 0.15s ease" }}>
                  <a
                    href={link.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-white/20 cursor-pointer hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "color 0.15s ease" }}
                    title="Open in Confluence"
                  >
                    <ExternalLink size={11} strokeWidth={1.5} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleUnlink(link.id)}
                    className="rounded p-0.5 text-white/20 cursor-pointer hover:text-[#e5534b]/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "color 0.15s ease" }}
                    title="Unlink page"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Inline preview */}
              {expandedPageId === link.pageId && (
                <div className="border-t border-white/[0.05]">
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
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.08] px-2.5 py-1.5 text-xs text-white/30 w-full cursor-pointer hover:border-[var(--color-brand-500)]/40 hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
