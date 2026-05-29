"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { useLinkIssueSearch } from "@/hooks/useLinkIssueSearch";
import type { LinkSearchResult } from "@/lib/api-client";
import { LinkSearchResultRow } from "./LinkSearchResultRow";
import { StatusFilterChips } from "./StatusFilterChips";
import { ScrollSentinel } from "./ScrollSentinel";
import { tickets } from "@/lib/api-client";
import { useLinkTypes } from "@/hooks/useLinkTypes";
import { Loader2, Search, ChevronDown, Check, Clock } from "lucide-react";

interface LinkIssueDialogProps {
  open: boolean;
  onClose: () => void;
  ticketKey: string;
  onLinked: () => void;
  defaultTargetKey?: string;
  defaultRelation?: string;
  initialQuery?: string;
}

export function LinkIssueDialog({
  open,
  onClose,
  ticketKey,
  onLinked,
  defaultTargetKey,
  defaultRelation,
  initialQuery,
}: LinkIssueDialogProps) {
  const { linkTypes } = useLinkTypes();
  const [relation, setRelation] = useState(defaultRelation ?? "relates to");
  const [selected, setSelected] = useState<LinkSearchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationFilter, setRelationFilter] = useState("");
  const [relationHighlight, setRelationHighlight] = useState(-1);
  const relationRef = useRef<HTMLDivElement>(null);
  const relationFilterRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = useLinkIssueSearch(ticketKey);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRelation(defaultRelation ?? "relates to");
      setSelected(null);
      setRelationOpen(false);
      setRelationFilter("");
      setSubmitError(null);
      search.resetSearch();
      // Carry over query from inline search or default target key
      const startQuery = initialQuery ?? defaultTargetKey ?? "";
      if (startQuery) {
        search.setQuery(startQuery);
      }
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close relation dropdown on click outside
  useEffect(() => {
    if (!relationOpen) return;
    function handleClick(e: MouseEvent) {
      if (!relationRef.current?.contains(e.target as Node)) setRelationOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [relationOpen]);

  const handleSelect = useCallback((result: LinkSearchResult) => {
    setSelected(result);
    search.setQuery(result.key);
    search.setShowResults(false);
  }, [search]);

  const handleSubmit = useCallback(async () => {
    const raw = selected?.key ?? search.query.trim();
    const urlMatch = raw.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const targetKey = urlMatch ? urlMatch[1].toUpperCase() : raw;
    if (!targetKey || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const linkTypeInfo = linkTypes.find((lt) => lt.value === relation);
      await tickets.createLink(ticketKey, {
        targetKey,
        relation,
        jiraTypeName: linkTypeInfo?.jiraTypeName,
        direction: linkTypeInfo?.direction,
      });
      onLinked();
    } catch (err) {
      setSubmitError("Failed to create link. Check that the issue key is valid.");
      console.error("Failed to create link:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [selected, search.query, relation, isSubmitting, ticketKey, onLinked, linkTypes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const showingRecent = !search.showResults && search.query.length < 2 && search.recentResults.length > 0;
    const activeList = search.showResults ? search.filteredResults : showingRecent ? search.recentResults : [];

    if (activeList.length === 0) {
      if (e.key === "Enter" && (selected || search.query.trim())) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      search.setHighlightIndex((i) => Math.min(i + 1, activeList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      search.setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (search.highlightIndex >= 0 && search.highlightIndex < activeList.length) {
        handleSelect(activeList[search.highlightIndex]);
      } else if (selected || search.query.trim()) {
        handleSubmit();
      }
    }
  }, [search, handleSelect, handleSubmit, selected]);

  if (!open) return null;

  const showRecentPicks = search.query.length < 2 && !selected && search.recentResults.length > 0;

  return (
    <Modal open={open} onClose={onClose} aria-label="Link issue">
      <div className="w-full max-w-lg rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-2xl)]">
        <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
          Link issue
        </h3>
        <p className="mt-1 text-body-sm text-text-tertiary">
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
              onClick={() => {
                setRelationOpen((v) => {
                  if (!v) {
                    setRelationFilter("");
                    setRelationHighlight(-1);
                    requestAnimationFrame(() => relationFilterRef.current?.focus());
                  }
                  return !v;
                });
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border-default bg-[var(--color-surface-default)] px-3 py-1.5 text-body-lg text-text-primary outline-none hover:border-border-strong focus-visible:border-[var(--color-brand-500)]/50 focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]/25"
              style={{ transition: "border-color 120ms" }}
            >
              <span>{linkTypes.find((o) => o.value === relation)?.label ?? relation}</span>
              <ChevronDown
                size={14}
                className={`shrink-0 text-text-muted ${relationOpen ? "rotate-180" : ""}`}
                style={{ transition: "transform 150ms" }}
              />
            </button>
            {relationOpen && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)]"
              >
                <div className="px-2 pt-2 pb-1">
                  <input
                    ref={relationFilterRef}
                    type="text"
                    value={relationFilter}
                    onChange={(e) => { setRelationFilter(e.target.value); setRelationHighlight(0); }}
                    onKeyDown={(e) => {
                      const filtered = linkTypes.filter((opt) => !relationFilter || opt.label.toLowerCase().includes(relationFilter.toLowerCase()));
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setRelationHighlight((i) => Math.min(i + 1, filtered.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setRelationHighlight((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = relationHighlight >= 0 ? relationHighlight : 0;
                        if (idx < filtered.length) {
                          setRelation(filtered[idx].value);
                          setRelationOpen(false);
                          requestAnimationFrame(() => searchRef.current?.focus());
                        }
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setRelationOpen(false);
                      }
                    }}
                    placeholder="Filter..."
                    className="w-full rounded-md border border-border-default bg-[var(--color-surface-default)] px-2.5 py-1 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50"
                  />
                </div>
                <div
                  className="max-h-56 overflow-y-auto py-1"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
                >
                  {linkTypes
                    .filter((opt) => !relationFilter || opt.label.toLowerCase().includes(relationFilter.toLowerCase()))
                    .map((opt, idx) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setRelation(opt.value); setRelationOpen(false); requestAnimationFrame(() => searchRef.current?.focus()); }}
                      onMouseEnter={() => setRelationHighlight(idx)}
                      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body-lg ${
                        idx === relationHighlight
                          ? "bg-overlay-default text-text-primary"
                          : opt.value === relation
                            ? "text-[var(--color-brand-400)]"
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
              {search.isSearching ? (
                <Loader2 size={13} className="animate-spin text-text-muted" />
              ) : (
                <Search size={13} className="text-text-muted" />
              )}
            </div>
            <input
              ref={searchRef}
              type="text"
              value={search.query}
              onChange={(e) => {
                search.setQuery(e.target.value);
                setSelected(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (search.filteredResults.length > 0 && !selected) search.setShowResults(true);
              }}
              onBlur={() => setTimeout(() => search.setShowResults(false), 200)}
              placeholder="Search by key or title..."
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-default)] py-1.5 pl-9 pr-3 text-body-lg text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50 focus:ring-1 focus:ring-[var(--color-brand-500)]/25"
            />

            {/* Search results dropdown */}
            {search.showResults && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)]"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
              >
                <StatusFilterChips
                  statuses={search.availableStatuses}
                  activeStatuses={search.activeStatuses}
                  onToggle={search.toggleStatus}
                  onClear={search.clearStatusFilter}
                />
                {search.filteredResults.length > 0 ? (
                  <>
                    {search.filteredResults.map((r, idx) => (
                      <LinkSearchResultRow
                        key={r.key}
                        result={r}
                        highlighted={idx === search.highlightIndex}
                        onSelect={handleSelect}
                        onHover={() => search.setHighlightIndex(idx)}
                      />
                    ))}
                    <ScrollSentinel
                      onIntersect={search.loadMore}
                      disabled={!search.hasMore || search.isLoadingMore}
                    />
                  </>
                ) : !search.isSearching ? (
                  <div className="px-3 py-2.5 text-body-sm text-text-muted">
                    No issues found for &ldquo;{search.query}&rdquo;
                  </div>
                ) : null}

                {(search.isSearchingJira || search.isLoadingMore) && (
                  <div className="flex items-center gap-2 border-t border-border-default px-3 py-2">
                    <Loader2 size={11} className="animate-spin text-text-muted" />
                    <span className="text-[11px] text-text-muted">
                      {search.isSearchingJira ? "Searching Jira..." : "Loading more..."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recently updated picks dropdown */}
            {showRecentPicks && !search.showResults && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Clock size={11} className="text-text-muted" strokeWidth={1.5} />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Recently updated
                  </span>
                </div>
                {search.recentResults.map((r, idx) => (
                  <LinkSearchResultRow
                    key={r.key}
                    result={r}
                    highlighted={idx === search.highlightIndex}
                    onSelect={handleSelect}
                    onHover={() => search.setHighlightIndex(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Selected issue chip */}
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-overlay-default px-2.5 py-1.5">
              <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 font-mono text-label font-medium text-text-secondary">
                {selected.key}
              </span>
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{selected.title}</span>
            </div>
          )}
        </div>

        {submitError && (
          <p className="mt-3 text-body-sm text-red-400/80">{submitError}</p>
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
            disabled={(!selected && !search.query.trim()) || isSubmitting}
            icon={isSubmitting ? <Loader2 size={12} className="animate-spin" /> : undefined}
          >
            Link
          </Button>
        </div>
      </div>
    </Modal>
  );
}
