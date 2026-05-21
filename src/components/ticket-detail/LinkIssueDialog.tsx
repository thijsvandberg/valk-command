"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { tickets } from "@/lib/api-client";
import { Loader2, Search, ChevronDown, Check } from "lucide-react";
import type { IssueType } from "@/types/ticket";

const RELATION_OPTIONS = [
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
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const relationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

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
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, defaultRelation, defaultTargetKey]);

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
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await tickets.searchForLink(q, ticketKey);
        setResults(data);
        setShowResults(true);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  }, [ticketKey]);

  const handleQueryChange = useCallback((value: string) => {
    // Extract issue key from Jira URLs (e.g. https://xxx.atlassian.net/browse/VPL-43728)
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
    if (!showResults || results.length === 0) {
      if (e.key === "Enter" && (selected || query.trim())) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        handleSelect(results[highlightIndex]);
      } else if (selected || query.trim()) {
        handleSubmit();
      }
    }
  }, [showResults, results, highlightIndex, handleSelect, handleSubmit, selected, query]);

  if (!open) return null;

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
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-100 ${
                      opt.value === relation
                        ? "bg-overlay-default text-text-primary"
                        : "text-text-secondary hover:bg-overlay-default hover:text-text-primary"
                    }`}
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
              onFocus={() => results.length > 0 && !selected && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="Search by key or title..."
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-default)] py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50 focus:ring-1 focus:ring-[var(--color-brand-500)]/25"
            />

            {/* Search results dropdown */}
            {showResults && (
              <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]">
                {results.length > 0 ? results.map((r, idx) => (
                  <button
                    key={r.key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 ${
                      idx === highlightIndex
                        ? "bg-overlay-strong"
                        : "hover:bg-overlay-default"
                    }`}
                  >
                    <IssueTypeIcon type={r.type as IssueType} size={13} />
                    <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{r.title}</span>
                  </button>
                )) : (
                  <div className="px-3 py-2.5 text-xs text-text-muted">
                    No issues found for &ldquo;{query}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-overlay-default px-2.5 py-1.5">
              <IssueTypeIcon type={selected.type as IssueType} size={13} />
              <span className="font-mono text-xs text-[var(--color-brand-400)]">{selected.key}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{selected.title}</span>
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
