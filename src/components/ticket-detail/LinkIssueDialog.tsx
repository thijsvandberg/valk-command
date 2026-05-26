"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/sprint-board/SearchResultParts";
import { tickets } from "@/lib/api-client";
import { Loader2, Search, ChevronDown, Check, Clock, Cloud } from "lucide-react";
import type { IssueType } from "@/types/ticket";

export const RELATION_OPTIONS = [
  { value: "relates to", label: "Relates to" },
  { value: "blocks", label: "Blocks" },
  { value: "is blocked by", label: "Is blocked by" },
  { value: "clones", label: "Clones" },
  { value: "is cloned by", label: "Is cloned by" },
  { value: "duplicates", label: "Duplicates" },
  { value: "is duplicated by", label: "Is duplicated by" },
];

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source?: "local" | "jira" | "recent";
}

interface LinkIssueDialogProps {
  open: boolean;
  onClose: () => void;
  ticketKey: string;
  onLinked: () => void;
  defaultTargetKey?: string;
  defaultRelation?: string;
}

export function LinkIssueDialog({
  open,
  onClose,
  ticketKey,
  onLinked,
  defaultTargetKey,
  defaultRelation,
}: LinkIssueDialogProps) {
  const [relation, setRelation] = useState(defaultRelation ?? "relates to");
  const [query, setQuery] = useState(defaultTargetKey ?? "");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentPicks, setRecentPicks] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingJira, setIsSearchingJira] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const relationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const jiraDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRelation(defaultRelation ?? "relates to");
      setQuery(defaultTargetKey ?? "");
      setSelected(null);
      setResults([]);
      setHighlightIndex(-1);
      setShowResults(false);
      setRelationOpen(false);
      setSubmitError(null);
      setIsSearchingJira(false);
      requestAnimationFrame(() => searchRef.current?.focus());

      // Fetch recent links
      tickets.recentLinks(ticketKey).then((data) => {
        setRecentPicks(data as SearchResult[]);
      }).catch(() => {
        // Non-critical
      });
    }
  }, [open, defaultRelation, defaultTargetKey, ticketKey]);

  // Close relation dropdown on click outside
  useEffect(() => {
    if (!relationOpen) return;
    function handleClick(e: MouseEvent) {
      if (!relationRef.current?.contains(e.target as Node)) setRelationOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [relationOpen]);

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      setIsSearchingJira(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Phase 1: fast local-only search
        const localData = await tickets.searchForLink(q, ticketKey, controller.signal);
        if (controller.signal.aborted) return;
        setResults(localData);
        setShowResults(true);
        setHighlightIndex(-1);
        setIsSearching(false);

        // Phase 2: if local results are sparse, also query Jira
        if (localData.length < 5) {
          setIsSearchingJira(true);
          jiraDebounceRef.current = setTimeout(async () => {
            try {
              const fullData = await tickets.searchForLinkWithJira(q, ticketKey, controller.signal);
              if (controller.signal.aborted) return;
              setResults(fullData);
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
        }
      }
    }, 200);
  }, [ticketKey]);

  const handleQueryChange = useCallback((value: string) => {
    // Extract issue key from Jira URLs
    const urlMatch = value.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const cleaned = urlMatch ? urlMatch[1].toUpperCase() : value;
    setQuery(cleaned);
    setSelected(null);
    doSearch(cleaned);
  }, [doSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    setSelected(result);
    setQuery(result.key);
    setShowResults(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const raw = selected?.key ?? query.trim();
    const urlMatch = raw.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const targetKey = urlMatch ? urlMatch[1].toUpperCase() : raw;
    if (!targetKey || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await tickets.createLink(ticketKey, {
        targetKey,
        relation,
      });
      onLinked();
    } catch (err) {
      setSubmitError("Failed to create link. Check that the issue key is valid.");
      console.error("Failed to create link:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [selected, query, relation, isSubmitting, ticketKey, onLinked]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // When showing recent picks (no search results, empty query)
    const showingRecent = !showResults && query.length < 2 && recentPicks.length > 0;
    const activeList = showResults ? results : showingRecent ? recentPicks : [];

    if (activeList.length === 0) {
      if (e.key === "Enter" && (selected || query.trim())) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, activeList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < activeList.length) {
        handleSelect(activeList[highlightIndex]);
      } else if (selected || query.trim()) {
        handleSubmit();
      }
    }
  }, [showResults, results, recentPicks, query, highlightIndex, handleSelect, handleSubmit, selected]);

  if (!open) return null;

  const showRecentPicks = query.length < 2 && !selected && recentPicks.length > 0;

  return (
    <Modal open={open} onClose={onClose} aria-label="Link issue">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-2xl)]">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
          Link issue
        </h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Create a relationship between {ticketKey} and another issue.
        </p>

        {/* Relation type */}
        <div className="mt-4">
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Relation type
          </label>
          <div ref={relationRef} className="relative">
            <button
              type="button"
              onClick={() => setRelationOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border-default bg-[var(--color-surface-default)] px-3 py-1.5 text-sm text-text-primary outline-none hover:border-border-strong focus-visible:border-[var(--color-brand-500)]/50 focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]/25"
              style={{ transition: "border-color 120ms" }}
            >
              <span>{RELATION_OPTIONS.find((o) => o.value === relation)?.label ?? relation}</span>
              <ChevronDown
                size={14}
                className={`shrink-0 text-text-muted ${relationOpen ? "rotate-180" : ""}`}
                style={{ transition: "transform 150ms" }}
              />
            </button>
            {relationOpen && (
              <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]">
                {RELATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setRelation(opt.value); setRelationOpen(false); }}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      opt.value === relation
                        ? "bg-overlay-default text-text-primary"
                        : "text-text-secondary hover:bg-overlay-default hover:text-text-primary"
                    }`}
                    style={{ transition: "background-color 80ms, color 80ms" }}
                  >
                    <Check
                      size={13}
                      className={`shrink-0 ${opt.value === relation ? "text-[var(--color-brand-400)]" : "invisible"}`}
                    />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Issue search */}
        <div className="mt-4">
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Issue
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              {isSearching ? (
                <Loader2 size={13} className="animate-spin text-text-muted" />
              ) : (
                <Search size={13} className="text-text-muted" />
              )}
            </div>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (results.length > 0 && !selected) setShowResults(true);
              }}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="Search by key or title..."
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-default)] py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50 focus:ring-1 focus:ring-[var(--color-brand-500)]/25"
            />

            {/* Search results dropdown */}
            {showResults && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
              >
                {results.length > 0 ? results.map((r, idx) => (
                  <button
                    key={r.key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
                    style={{
                      borderLeft: idx === highlightIndex ? "2px solid var(--color-brand-400)" : "2px solid transparent",
                      backgroundColor: idx === highlightIndex ? "var(--color-overlay-subtle)" : undefined,
                      transition: "background-color 80ms, border-color 80ms",
                    }}
                  >
                    <IssueTypeIcon type={r.type as IssueType} size={13} />
                    <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{r.title}</span>
                    <StatusBadge status={r.status} />
                    {r.source === "jira" && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", color: "rgba(147, 197, 253, 0.8)" }}
                      >
                        <Cloud size={9} strokeWidth={2} />
                        Jira
                      </span>
                    )}
                  </button>
                )) : !isSearching ? (
                  <div className="px-3 py-2.5 text-xs text-text-muted">
                    No issues found for &ldquo;{query}&rdquo;
                  </div>
                ) : null}

                {/* Jira loading indicator */}
                {isSearchingJira && (
                  <div className="flex items-center gap-2 border-t border-border-default px-3 py-2">
                    <Loader2 size={11} className="animate-spin text-text-muted" />
                    <span className="text-[11px] text-text-muted">Searching Jira...</span>
                  </div>
                )}
              </div>
            )}

            {/* Recent picks dropdown */}
            {showRecentPicks && !showResults && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Clock size={11} className="text-text-muted" strokeWidth={1.5} />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Recently linked
                  </span>
                </div>
                {recentPicks.map((r, idx) => (
                  <button
                    key={r.key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
                    style={{
                      borderLeft: idx === highlightIndex ? "2px solid var(--color-brand-400)" : "2px solid transparent",
                      backgroundColor: idx === highlightIndex ? "var(--color-overlay-subtle)" : undefined,
                      transition: "background-color 80ms, border-color 80ms",
                    }}
                  >
                    <IssueTypeIcon type={r.type as IssueType} size={13} />
                    <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{r.title}</span>
                    <StatusBadge status={r.status} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected issue chip */}
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-overlay-default px-2.5 py-1.5">
              <IssueTypeIcon type={selected.type as IssueType} size={13} />
              <span className="font-mono text-xs text-[var(--color-brand-400)]">{selected.key}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{selected.title}</span>
              <StatusBadge status={selected.status} />
              {selected.source === "jira" && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", color: "rgba(147, 197, 253, 0.8)" }}
                >
                  <Cloud size={9} strokeWidth={2} />
                  Jira
                </span>
              )}
            </div>
          )}
        </div>

        {submitError && (
          <p className="mt-3 text-xs text-red-400/80">{submitError}</p>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={(!selected && !query.trim()) || isSubmitting}
            icon={isSubmitting ? <Loader2 size={12} className="animate-spin" /> : undefined}
          >
            Link
          </Button>
        </div>
      </div>
    </Modal>
  );
}
