"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketDetail, LinkedIssue } from "@/types/ticket";
import { Avatar } from "@/components/shared/Avatar";
import { ChildIssueRow } from "./ChildIssueRow";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { LinkIssueDialog } from "./LinkIssueDialog";
import { useLinkTypes } from "@/hooks/useLinkTypes";
import { useLinkIssueSearch } from "@/hooks/useLinkIssueSearch";
import type { LinkSearchResult } from "@/lib/api-client";
import { RelatedSuggestions, toRelatedSuggestion, type RelatedSuggestion } from "./RelatedIssueSuggestions";
import { LinkSearchResultRow } from "./LinkSearchResultRow";
import { StatusFilterChips } from "./StatusFilterChips";
import { ScrollSentinel } from "./ScrollSentinel";
import { tickets } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError, isRetryableStreamError } from "@/lib/agent-errors";
import { X, Sparkles, Loader2, Link2, ChevronDown, Maximize2, Clock, Plus, MoreHorizontal } from "lucide-react";

interface LinkedIssuesSectionProps {
  issues: TicketDetail["linkedIssues"];
  ticketKey: string;
  onMutate: () => void;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      title="Remove link"
    >
      <X size={14} strokeWidth={2} />
      <span>Delete</span>
    </button>
  );
}

export function LinkedIssuesSection({ issues, ticketKey, onMutate }: LinkedIssuesSectionProps) {
  const { linkTypes } = useLinkTypes();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogDefaults, setLinkDialogDefaults] = useState<{ initialQuery?: string; relation?: string }>({});

  // Inline link input state
  const [inlineRelation, setInlineRelation] = useState("relates to");
  const [inlineRelationOpen, setInlineRelationOpen] = useState(false);
  const [inlineRelationFilter, setInlineRelationFilter] = useState("");
  const [inlineRelationHighlight, setInlineRelationHighlight] = useState(-1);
  const inlineRelationRef = useRef<HTMLDivElement>(null);
  const inlineRelationFilterRef = useRef<HTMLInputElement>(null);
  const [inlinePending, setInlinePending] = useState<LinkedIssue[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [inlineFocused, setInlineFocused] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  // Which create composer is open (BRDG-315): null = closed, "__bottom__" = the header "+", or a
  // relation value = the "+" on that group's heading (the composer then expands within that
  // section with the link type preset to that relation).
  const [composerAt, setComposerAt] = useState<string | null>(null);
  useEffect(() => {
    if (composerAt) requestAnimationFrame(() => inlineInputRef.current?.focus());
  }, [composerAt]);
  const openGroupComposer = useCallback((relation: string) => {
    setInlineRelation(relation);
    setComposerAt((prev) => (prev === relation ? null : relation));
  }, []);
  const inlineDropdownRef = useRef<HTMLDivElement>(null);
  const interactingWithDropdownRef = useRef(false);

  // Header actions menu (BRDG): the AI-suggest and link actions live behind one "..." trigger.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(headerMenuRef, () => setHeaderMenuOpen(false), { enabled: headerMenuOpen });

  // Shared search hook
  const search = useLinkIssueSearch(ticketKey);

  // AI suggestions state (managed here, like SubtasksSection)
  const [suggestions, setSuggestions] = useState<RelatedSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestProgress, setSuggestProgress] = useState<string | null>(null);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [linkingKeys, setLinkingKeys] = useState<Set<string>>(new Set());
  const [suggestTaskId, setSuggestTaskId] = useState<string | null>(null);
  const suggestRetryRef = useRef(0);
  const handleSuggestRef = useRef<(isRetry?: boolean) => void>(() => {});

  // Load persisted suggestions on mount
  useEffect(() => {
    let cancelled = false;
    tickets.getRelatedSuggestions(ticketKey).then((data) => {
      if (!cancelled && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.map(toRelatedSuggestion));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticketKey]);

  // Prune deletingKeys: compute the effective set during render
  const effectiveDeletingKeys = (() => {
    if (deletingKeys.size === 0) return deletingKeys;
    const issueIds = new Set(issues.map((i) => `${i.key}:${i.relation}`));
    const stillPresent = [...deletingKeys].filter((id) => issueIds.has(id));
    if (stillPresent.length === deletingKeys.size) return deletingKeys;
    return new Set(stillPresent);
  })();

  useOutsideClick(inlineRelationRef, () => setInlineRelationOpen(false), { enabled: inlineRelationOpen, escapeClose: false });

  useEffect(() => {
    if (!inlineRelationOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setInlineRelationOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [inlineRelationOpen]);

  // Stream handling for AI suggestions
  useTaskStream(suggestTaskId, {
    timeout: 0,
    onProgress: (message) => setSuggestProgress(message),
    onToolCall: (tool) => {
      const clean = tool.replace("mcp__jira__", "").replace("mcp__", "");
      setSuggestProgress(`Using ${clean}...`);
    },
    onResult: async (resultData) => {
      const output = (resultData.output as string) ?? "";
      setSuggestProgress("Processing results...");
      try {
        const parsed = await tickets.applyRelatedSuggestions(ticketKey, { output });
        setSuggestions(parsed.suggestions.map(toRelatedSuggestion));
      } catch {
        setSuggestError("Failed to process results");
      }
      setSuggestLoading(false);
      setSuggestProgress(null);
    },
    onError: (message) => {
      if (isRetryableStreamError(message) && suggestRetryRef.current < 1) {
        suggestRetryRef.current += 1;
        handleSuggestRef.current(true);
        return;
      }
      setSuggestError(friendlyStreamError(message));
      setSuggestLoading(false);
      setSuggestProgress(null);
    },
    onNetworkError: () => {
      setSuggestError("Connection to workspace lost");
      setSuggestLoading(false);
      setSuggestProgress(null);
    },
  });

  const handleSuggest = useCallback(async (isRetry = false) => {
    if (suggestLoading && !isRetry) return;

    if (!isRetry) {
      suggestRetryRef.current = 0;
    }

    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestProgress(isRetry ? "Retrying..." : "Starting...");
    setSuggestions([]);
    setSuggestTaskId(null);

    try {
      const data = await tickets.findRelatedSuggestions(ticketKey);

      if (data.cached && data.suggestions) {
        setSuggestions(data.suggestions.map(toRelatedSuggestion));
        setSuggestLoading(false);
        setSuggestProgress(null);
        return;
      }

      if (data.taskId) {
        setSuggestTaskId(data.taskId);
        return;
      }

      setSuggestLoading(false);
      setSuggestProgress(null);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Failed to start search");
      setSuggestLoading(false);
      setSuggestProgress(null);
    }
  }, [ticketKey, suggestLoading]);

  useEffect(() => {
    handleSuggestRef.current = handleSuggest;
  }, [handleSuggest]);

  const handleAcceptSuggestion = useCallback(async (suggestion: RelatedSuggestion) => {
    setLinkingKeys((prev) => new Set(prev).add(suggestion.key));

    try {
      await tickets.createLink(ticketKey, {
        targetKey: suggestion.key,
        relation: suggestion.suggestedRelation,
      });
      setSuggestions((prev) => prev.filter((s) => s.key !== suggestion.key));
      onMutate();
      tickets.dismissRelatedSuggestion(ticketKey, { id: suggestion.id }).catch(() => {});
    } catch (err) {
      console.error("Failed to link suggestion:", err);
    }

    setLinkingKeys((prev) => {
      const next = new Set(prev);
      next.delete(suggestion.key);
      return next;
    });
  }, [ticketKey, onMutate]);

  const handleDeclineSuggestion = useCallback((suggestion: RelatedSuggestion) => {
    setSuggestions((prev) => prev.filter((s) => s.key !== suggestion.key));
    tickets.dismissRelatedSuggestion(ticketKey, { id: suggestion.id }).catch(() => {});
  }, [ticketKey]);

  const handleDeclineAll = useCallback(() => {
    setSuggestions([]);
    tickets.clearRelatedSuggestions(ticketKey).catch(() => {});
  }, [ticketKey]);

  const handleDelete = useCallback(async (item: LinkedIssue) => {
    const deleteId = `${item.key}:${item.relation}`;
    setDeletingKeys((prev) => new Set(prev).add(deleteId));
    setInlineError(null);

    try {
      await tickets.deleteLink(ticketKey, {
        jiraLinkId: item.jiraLinkId,
        linkedKey: item.key,
        relation: item.relation,
      });
      onMutate();
    } catch (err) {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(deleteId);
        return next;
      });
      setInlineError(`Failed to remove link to ${item.key}`);
      console.error("Failed to delete link:", err);
    }
  }, [ticketKey, onMutate]);

  const handleLinkCreated = useCallback(() => {
    setShowLinkDialog(false);
    setLinkDialogDefaults({});
    onMutate();
  }, [onMutate]);

  const handleInlineLink = useCallback((result: LinkSearchResult) => {
    const alreadyLinked = issues.some((i) => i.key === result.key && i.relation === inlineRelation)
      || inlinePending.some((i) => i.key === result.key && i.relation === inlineRelation);
    if (alreadyLinked) {
      setInlineError(`${result.key} is already linked as "${inlineRelation}"`);
      return;
    }

    const placeholder: LinkedIssue = {
      key: result.key,
      title: result.title,
      type: result.type as LinkedIssue["type"],
      jiraStatus: result.status as LinkedIssue["jiraStatus"],
      assignee: null,
      relation: inlineRelation,
      jiraLinkId: `pending-${Date.now()}`,
    };
    setInlinePending((prev) => [...prev, placeholder]);
    search.resetSearch();
    setInlineError(null);

    const pendingRelation = inlineRelation;
    const linkTypeInfo = linkTypes.find((lt) => lt.value === inlineRelation);
    tickets.createLink(ticketKey, {
      targetKey: result.key,
      relation: pendingRelation,
      jiraTypeName: linkTypeInfo?.jiraTypeName,
      direction: linkTypeInfo?.direction,
    })
      .then(() => {
        setInlinePending((prev) => prev.filter((p) => !(p.key === result.key && p.relation === pendingRelation)));
        onMutate();
      })
      .catch((err) => {
        setInlinePending((prev) => prev.filter((p) => !(p.key === result.key && p.relation === pendingRelation)));
        setInlineError(`Failed to link ${result.key}`);
        console.error("Failed to create inline link:", err);
      });
  }, [ticketKey, issues, inlinePending, inlineRelation, onMutate, search, linkTypes]);

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd+Shift+K to expand to modal
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
      e.preventDefault();
      setLinkDialogDefaults({ initialQuery: search.query, relation: inlineRelation });
      setShowLinkDialog(true);
      return;
    }

    const activeList = search.showResults ? search.filteredResults : (search.query.length < 2 ? search.recentResults : []);
    if (activeList.length === 0) {
      if (e.key === "Escape") {
        search.resetSearch();
        inlineInputRef.current?.blur();
        // Escape on an empty input closes the composer (parity with the sprint board create row).
        if (!search.query) setComposerAt(null);
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
      const idx = search.highlightIndex >= 0 ? search.highlightIndex : 0;
      if (idx < activeList.length) {
        handleInlineLink(activeList[idx]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      search.setShowResults(false);
      search.resetSearch();
      inlineInputRef.current?.blur();
    }
  }, [search, handleInlineLink, inlineRelation]);

  const allIssues = [
    ...issues.filter((i) => !effectiveDeletingKeys.has(`${i.key}:${i.relation}`)),
    ...inlinePending.filter((p) => !issues.some((i) => i.key === p.key && i.relation === p.relation)),
  ];

  const grouped = allIssues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  const showRecentPicks = inlineFocused && search.query.length < 2 && !search.showResults && search.recentResults.length > 0;

  const headerActiveState = headerMenuOpen || composerAt === "__bottom__" || suggestions.length > 0;

  const headerMenu = (
    <div className="relative" ref={headerMenuRef}>
      <button
        type="button"
        onClick={() => setHeaderMenuOpen((v) => !v)}
        aria-label="Linked issues actions"
        aria-haspopup="menu"
        aria-expanded={headerMenuOpen}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          headerActiveState
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title="Link an issue or find related issues with AI"
      >
        <MoreHorizontal size={14} strokeWidth={1.5} />
      </button>

      {headerMenuOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 w-[232px] overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-floating)] p-1 shadow-[var(--shadow-popover)]"
          style={{ animation: "fadeInUp 0.1s ease" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setComposerAt((v) => (v === "__bottom__" ? null : "__bottom__"));
              setHeaderMenuOpen(false);
            }}
            title="Link an issue"
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-list-item ${
              composerAt === "__bottom__" ? "text-[var(--color-brand-400)]" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Plus size={14} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
            <span>Link an issue</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setSuggestionsExpanded(true);
              if (suggestions.length === 0) handleSuggest();
              setHeaderMenuOpen(false);
            }}
            disabled={suggestLoading}
            title={suggestions.length > 0 ? `${suggestions.length} pending AI suggestions` : "Find related issues with AI"}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-list-item disabled:cursor-not-allowed disabled:opacity-60 ${
              suggestions.length > 0 ? "text-[var(--color-brand-400)]" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {suggestLoading ? (
              <Loader2 size={14} strokeWidth={1.5} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
            )}
            <span>Find related issues with AI</span>
            {suggestions.length > 0 ? (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-[10px] font-semibold text-white">
                {suggestions.length}
              </span>
            ) : null}
          </button>
        </div>
      )}
    </div>
  );

  // The link composer (one shared instance) renders under whichever group's "+" is active, or at
  // the bottom when opened from the header "+" — styled as the shared raised inset bar (BRDG-315).
  const linkComposer = (
      <div className="mt-3 rounded-lg bg-[var(--color-surface-chrome)]/40 p-3 lg:p-4">
      <div className="relative rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div ref={inlineRelationRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setInlineRelationOpen((v) => {
                  if (!v) {
                    setInlineRelationFilter("");
                    setInlineRelationHighlight(-1);
                    requestAnimationFrame(() => inlineRelationFilterRef.current?.focus());
                  }
                  return !v;
                });
              }}
              className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary cursor-pointer hover:bg-overlay-default hover:border-border-strong active:bg-overlay-strong transition-colors duration-150"
            >
              <Link2 size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              <span className="max-w-[100px] truncate">
                {linkTypes.find((o) => o.value === inlineRelation)?.label ?? "Relates to"}
              </span>
              <ChevronDown size={10} strokeWidth={2} className="text-text-muted" />
            </button>
            {inlineRelationOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)]"
              >
                <div className="px-2 pt-2 pb-1">
                  <input
                    ref={inlineRelationFilterRef}
                    type="text"
                    value={inlineRelationFilter}
                    onChange={(e) => { setInlineRelationFilter(e.target.value); setInlineRelationHighlight(0); }}
                    onKeyDown={(e) => {
                      const filtered = linkTypes.filter((opt) => !inlineRelationFilter || opt.label.toLowerCase().includes(inlineRelationFilter.toLowerCase()));
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setInlineRelationHighlight((i) => Math.min(i + 1, filtered.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setInlineRelationHighlight((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = inlineRelationHighlight >= 0 ? inlineRelationHighlight : 0;
                        if (idx < filtered.length) {
                          setInlineRelation(filtered[idx].value);
                          setInlineRelationOpen(false);
                          requestAnimationFrame(() => inlineInputRef.current?.focus());
                        }
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setInlineRelationOpen(false);
                      }
                    }}
                    placeholder="Filter..."
                    className="w-full rounded-md border border-border-default bg-[var(--color-surface-default)] px-2 py-1 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--color-brand-500)]/50"
                  />
                </div>
                <div
                  className="max-h-52 overflow-y-auto py-1"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
                >
                  {linkTypes
                    .filter((opt) => !inlineRelationFilter || opt.label.toLowerCase().includes(inlineRelationFilter.toLowerCase()))
                    .map((opt, idx) => (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setInlineRelation(opt.value);
                        setInlineRelationOpen(false);
                        requestAnimationFrame(() => inlineInputRef.current?.focus());
                      }}
                      onMouseEnter={() => setInlineRelationHighlight(idx)}
                      className={`flex w-full items-center px-3 py-1.5 text-body-sm cursor-pointer transition-colors duration-150 ${
                        idx === inlineRelationHighlight
                          ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                          : inlineRelation === opt.value
                            ? "text-[var(--color-brand-400)]"
                            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <input
            ref={inlineInputRef}
            type="text"
            value={search.query}
            onChange={(e) => { search.setQuery(e.target.value); setInlineError(null); }}
            onKeyDown={handleInlineKeyDown}
            onFocus={() => {
              setInlineFocused(true);
              if (search.filteredResults.length > 0) search.setShowResults(true);
            }}
            onBlur={() => setTimeout(() => {
              if (interactingWithDropdownRef.current) return;
              search.setShowResults(false);
              setInlineFocused(false);
            }, 200)}
            placeholder="Link issue..."
            className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
          />
          {search.isSearching && <Loader2 size={13} className="shrink-0 animate-spin text-text-muted" />}
          <button
            type="button"
            onClick={() => {
              setLinkDialogDefaults({ initialQuery: search.query, relation: inlineRelation });
              setShowLinkDialog(true);
            }}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-default"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            title="Expand search (Cmd+Shift+K)"
          >
            <Maximize2 size={13} strokeWidth={1.5} />
          </button>
        </div>

        {/* Search results dropdown */}
        {search.showResults && (
          <div
            ref={inlineDropdownRef}
            onMouseDown={() => { interactingWithDropdownRef.current = true; }}
            onMouseUp={() => { setTimeout(() => { interactingWithDropdownRef.current = false; }, 300); }}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)]"
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
                    onSelect={handleInlineLink}
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

        {/* Recently updated tickets (empty state) */}
        {showRecentPicks && (
          <div
            onMouseDown={() => { interactingWithDropdownRef.current = true; }}
            onMouseUp={() => { setTimeout(() => { interactingWithDropdownRef.current = false; }, 300); }}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]"
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
                onSelect={handleInlineLink}
                onHover={() => search.setHighlightIndex(idx)}
              />
            ))}
          </div>
        )}

        {inlineError && (
          <div className="border-t border-border-default px-3 py-2 text-body-sm text-red-400/80">
            {inlineError}
          </div>
        )}
      </div>
      </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Linked Issues"
        count={allIssues.length}
        actions={headerMenu}
        sectionKey={SECTION_KEYS.linkedIssues}
      >

      {allIssues.length > 0 && (
        <div className="mt-3 space-y-4">
          {Object.entries(grouped).map(([relation, items]) => (
            <div key={relation}>
              <div className="group/relgroup mb-2 flex items-center gap-1.5">
                <span className="text-label font-medium uppercase tracking-wider text-text-muted">
                  {relation}
                </span>
                <button
                  type="button"
                  onClick={() => openGroupComposer(relation)}
                  aria-label={`Add a "${relation}" link`}
                  aria-pressed={composerAt === relation}
                  title={`Add a "${relation}" link`}
                  className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                    composerAt === relation
                      ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                      : "text-text-muted opacity-0 group-hover/relgroup:opacity-100 hover:bg-overlay-subtle hover:text-text-secondary"
                  }`}
                  style={{ transition: "opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease" }}
                >
                  <Plus size={12} strokeWidth={2} />
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-border-default">
                {items.map((item, idx) => {
                  const isPending = item.jiraLinkId?.startsWith("pending-");

                  return (
                    <ChildIssueRow
                      key={item.key}
                      item={item}
                      isLast={idx === items.length - 1}
                      isPending={isPending}
                      showTypeIcon
                      showKey
                      showStatus
                      metadataSlot={<Avatar assignee={item.assignee} size={22} />}
                      actionsSlot={!isPending ? (
                        <DeleteButton onClick={() => handleDelete(item)} />
                      ) : undefined}
                    />
                  );
                })}
              </div>
              {composerAt === relation && linkComposer}
            </div>
          ))}
        </div>
      )}

      {/* Header "+" opens the composer at the bottom; a group "+" opens it within that group. */}
      {composerAt === "__bottom__" && linkComposer}

      <RelatedSuggestions
        suggestions={suggestions}
        isLoading={suggestLoading}
        progressText={suggestProgress}
        error={suggestError}
        linkingKeys={linkingKeys}
        isExpanded={suggestionsExpanded}
        onToggleExpanded={() => setSuggestionsExpanded((prev) => !prev)}
        onAccept={handleAcceptSuggestion}
        onDecline={handleDeclineSuggestion}
        onDeclineAll={handleDeclineAll}
        onRegenerate={() => handleSuggest()}
      />

      <LinkIssueDialog
        open={showLinkDialog}
        onClose={() => { setShowLinkDialog(false); setLinkDialogDefaults({}); }}
        ticketKey={ticketKey}
        onLinked={handleLinkCreated}
        initialQuery={linkDialogDefaults.initialQuery}
        defaultRelation={linkDialogDefaults.relation}
      />
      </SectionHeader>
    </div>
  );
}
