"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketDetail, LinkedIssue, Ticket } from "@/types/ticket";
import { LinkedIssueRow } from "./LinkedIssueRow";
import { useTicketsByKeys } from "@/hooks/useSprintBoard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { useSectionCollapsed } from "@/hooks/useSectionCollapsed";
import { LinkIssueDialog } from "./LinkIssueDialog";
import { useLinkTypes } from "@/hooks/useLinkTypes";
import { useLinkIssueSearch } from "@/hooks/useLinkIssueSearch";
import type { LinkSearchResult } from "@/lib/api-client";
import { RelatedSuggestions, toRelatedSuggestion, type RelatedSuggestion } from "./RelatedIssueSuggestions";
import { LinkSearchResultRow } from "./LinkSearchResultRow";
import { HoverDataProvider } from "@/hooks/useTicketHoverData";
import { StatusFilterChips } from "./StatusFilterChips";
import { ScrollSentinel } from "./ScrollSentinel";
import { tickets } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError, isRetryableStreamError } from "@/lib/agent-errors";
import { RelationPicker } from "./RelationPicker";
import { X, Sparkles, Loader2, Link2, ChevronDown, Maximize2, Clock, Plus, MoreHorizontal, ArrowLeftRight } from "lucide-react";

interface LinkedIssuesSectionProps {
  issues: TicketDetail["linkedIssues"];
  ticketKey: string;
  onMutate: () => void;
  /** Opens a linked issue in the SidePanel (or navigates) when a row is clicked. Mirrors
      Subtasks/Epic-children. Omitted -> rows are not clickable (BRDG-332). */
  onSelectTicket?: (key: string) => void;
  /** Key of the ticket currently open in the panel, used to highlight the active row. */
  activeKey?: string;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      title="Remove link"
    >
      <X size={14} strokeWidth={2} />
      <span>Delete</span>
    </button>
  );
}

function ChangeTypeButton({ onClick, active, disabled }: { onClick: () => void; active: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-pressed={active}
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
          : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary active:bg-overlay-default"
      }`}
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      title="Change link type"
    >
      {disabled ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : <ArrowLeftRight size={13} strokeWidth={2} />}
      <span>Type</span>
    </button>
  );
}

export function LinkedIssuesSection({ issues, ticketKey, onMutate, onSelectTicket, activeKey }: LinkedIssuesSectionProps) {
  const { linkTypes } = useLinkTypes();
  // Resolve live data for exactly the linked issues (a bounded set), so linked
  // rows can refresh from current ticket data instead of their cached link
  // snapshot (BRDG-333 follow-up) without loading the whole backlog (BRDG-387).
  const linkedKeys = useMemo(() => issues.map((i) => i.key), [issues]);
  const boardTickets = useTicketsByKeys(linkedKeys);
  const boardTicketByKey = useMemo(() => {
    const m = new Map<string, Ticket>();
    boardTickets.forEach((t) => m.set(t.key, t));
    return m;
  }, [boardTickets]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogDefaults, setLinkDialogDefaults] = useState<{ initialQuery?: string; relation?: string }>({});

  // Inline link input state
  const [inlineRelation, setInlineRelation] = useState("relates to");
  const [inlineRelationOpen, setInlineRelationOpen] = useState(false);
  const inlineRelationRef = useRef<HTMLDivElement>(null);
  const [inlinePending, setInlinePending] = useState<LinkedIssue[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  // Per-row change-type editor (BRDG-385): which row's relation picker is open (composite
  // "key:relation"), and which rows have a retype in flight (disables their action).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [retypingKeys, setRetypingKeys] = useState<Set<string>>(new Set());
  const editPanelRef = useRef<HTMLDivElement>(null);
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
  // Closing the whole composer on outside-click mirrors what Escape does on an empty input.
  const composerRef = useRef<HTMLDivElement>(null);

  // Header actions menu (BRDG): the AI-suggest and link actions live behind one "..." trigger.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(headerMenuRef, () => setHeaderMenuOpen(false), { enabled: headerMenuOpen });

  // Shared search hook
  const search = useLinkIssueSearch(ticketKey);

  const closeComposer = useCallback(() => {
    setComposerAt(null);
    search.resetSearch();
    setInlineError(null);
  }, [search]);

  // Click outside the composer closes the whole flow, like Escape on an empty input. Suspended
  // while the expanded dialog is open, since that modal lives outside the composer's DOM.
  useOutsideClick(composerRef, closeComposer, {
    enabled: composerAt !== null && !showLinkDialog,
    escapeClose: false,
  });

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
  useOutsideClick(editPanelRef, () => setEditingKey(null), { enabled: editingKey !== null, escapeClose: false });

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

  // Change the relation type of an existing link (BRDG-385). Jira can't edit a link's type,
  // so the server deletes + recreates; here we optimistically move the row to the new relation
  // group and revert if the call fails.
  const handleChangeType = useCallback((item: LinkedIssue, newRelation: string) => {
    if (newRelation === item.relation) {
      setEditingKey(null);
      return;
    }
    const alreadyLinked = issues.some((i) => i.key === item.key && i.relation === newRelation)
      || inlinePending.some((i) => i.key === item.key && i.relation === newRelation);
    if (alreadyLinked) {
      setInlineError(`${item.key} is already linked as "${newRelation}"`);
      return;
    }

    setEditingKey(null);
    setInlineError(null);

    const oldComposite = `${item.key}:${item.relation}`;
    const newComposite = `${item.key}:${newRelation}`;

    // Optimistic move: hide the row in its old group, surface a placeholder in the new one.
    // Both overlays self-prune once the parent refetch lands (same pattern as inline create).
    setDeletingKeys((prev) => new Set(prev).add(oldComposite));
    setInlinePending((prev) => [...prev, { ...item, relation: newRelation }]);
    setRetypingKeys((prev) => new Set(prev).add(newComposite));

    const linkTypeInfo = linkTypes.find((lt) => lt.value === newRelation);
    tickets.changeLinkType(ticketKey, {
      jiraLinkId: item.jiraLinkId,
      linkedKey: item.key,
      currentRelation: item.relation,
      relation: newRelation,
      jiraTypeName: linkTypeInfo?.jiraTypeName,
      direction: linkTypeInfo?.direction,
    })
      .then(() => {
        onMutate();
        setRetypingKeys((prev) => { const next = new Set(prev); next.delete(newComposite); return next; });
      })
      .catch((err) => {
        setDeletingKeys((prev) => { const next = new Set(prev); next.delete(oldComposite); return next; });
        setInlinePending((prev) => prev.filter((p) => !(p.key === item.key && p.relation === newRelation)));
        setRetypingKeys((prev) => { const next = new Set(prev); next.delete(newComposite); return next; });
        setInlineError(`Failed to change link type for ${item.key}`);
        console.error("Failed to change link type:", err);
      });
  }, [issues, inlinePending, linkTypes, ticketKey, onMutate]);

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
        // Keep the pending placeholder visible until the refetch surfaces the real link; the
        // dedup in `allIssues` drops it automatically once `issues` contains it. Removing it here
        // caused the row to vanish during a slow refetch and reappear seconds later (BRDG).
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

    // Escape closes the whole composer (parity with click-outside). stopPropagation keeps it from
    // also closing an enclosing panel that listens for Escape.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      inlineInputRef.current?.blur();
      closeComposer();
      return;
    }

    // Default view lists referenced rows first, then recently-updated rows with
    // any referenced key removed (BRDG-433), so keyboard order matches the render.
    const referencedKeys = new Set(search.referencedResults.map((r) => r.key));
    const dedupedRecent = search.recentResults.filter((r) => !referencedKeys.has(r.key));
    const defaultList = [...search.referencedResults, ...dedupedRecent];
    const activeList = search.showResults ? search.filteredResults : (search.query.length < 2 ? defaultList : []);
    if (activeList.length === 0) return;

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
    }
  }, [search, handleInlineLink, inlineRelation, closeComposer]);

  const allIssues = [
    ...issues.filter((i) => !effectiveDeletingKeys.has(`${i.key}:${i.relation}`)),
    ...inlinePending.filter((p) => !issues.some((i) => i.key === p.key && i.relation === p.relation)),
  ];

  const grouped = allIssues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  // An empty Linked Issues section starts collapsed; expanding it surfaces the link composer right
  // away so the only useful action is one click in. With existing links the section stays expanded
  // and the composer stays hidden (the user opts in via the "+"/menu). Driven by an
  // adjust-state-during-render transition (not an effect) so the composer opens on the very render
  // that expands the empty section, and reopening is skipped once the user closes it.
  //
  // The empty case uses ephemeral, per-ticket state instead of the shared collapse store: expanding
  // an empty section is a transient "add a link to THIS ticket" action, not a durable layout
  // preference. Persisting it (as the store does) would replay "expanded" on every other ticket that
  // also has no links, re-opening the composer unprompted. Reset on ticketKey change so it never
  // leaks. Non-empty sections keep the persisted store: collapsing a real list is a sticky choice.
  const isEmpty = allIssues.length === 0;
  const { isCollapsed } = useSectionCollapsed();
  const [emptyExpanded, setEmptyExpanded] = useState(false);
  const [prevTicketKey, setPrevTicketKey] = useState(ticketKey);
  if (ticketKey !== prevTicketKey) {
    setPrevTicketKey(ticketKey);
    setEmptyExpanded(false);
  }
  const collapsed = isEmpty ? !emptyExpanded : isCollapsed(SECTION_KEYS.linkedIssues, false);
  const expandedEmpty = !collapsed && isEmpty;
  const [prevExpandedEmpty, setPrevExpandedEmpty] = useState(false);
  if (expandedEmpty !== prevExpandedEmpty) {
    setPrevExpandedEmpty(expandedEmpty);
    if (expandedEmpty) setComposerAt((prev) => prev ?? "__bottom__");
  }

  // Referenced section (BRDG-433) wins over the recent list: a ticket in both is
  // shown only once, at the top. The de-duped recent list feeds both the render
  // and the keyboard highlight indexing in handleInlineKeyDown.
  const referencedPicks = search.referencedResults;
  const referencedPickKeys = new Set(referencedPicks.map((r) => r.key));
  const dedupedRecentPicks = search.recentResults.filter((r) => !referencedPickKeys.has(r.key));
  const showRecentPicks =
    inlineFocused &&
    search.query.length < 2 &&
    !search.showResults &&
    (referencedPicks.length > 0 || dedupedRecentPicks.length > 0);

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
          className="absolute top-full right-0 z-dropdown mt-1 w-[232px] overflow-hidden rounded-xl border border-border-default bg-surface-floating p-1 shadow-popover"
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
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
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
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            {suggestLoading ? (
              <Loader2 size={14} strokeWidth={1.5} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
            )}
            <span>Find related issues with AI</span>
            {suggestions.length > 0 ? (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-caption font-semibold text-white">
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
      <div ref={composerRef} className="mt-3 rounded-lg bg-surface-chrome/40 p-3 lg:p-4">
      <div className="relative rounded-lg border border-border-default bg-surface-elevated shadow-sm">
        <div className="flex items-center gap-3 px-3 py-2">
          <div ref={inlineRelationRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setInlineRelationOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary cursor-pointer hover:bg-overlay-default hover:border-border-strong active:bg-overlay-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <Link2 size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              <span className="max-w-[100px] truncate">
                {linkTypes.find((o) => o.value === inlineRelation)?.label ?? "Relates to"}
              </span>
              <ChevronDown size={10} strokeWidth={2} className="text-text-muted" />
            </button>
            {inlineRelationOpen && (
              <RelationPicker
                value={inlineRelation}
                linkTypes={linkTypes}
                onSelect={(v) => {
                  setInlineRelation(v);
                  setInlineRelationOpen(false);
                  requestAnimationFrame(() => inlineInputRef.current?.focus());
                }}
                onClose={() => setInlineRelationOpen(false)}
                className="absolute left-0 top-full z-dropdown mt-1 w-56"
              />
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
          <button
            type="button"
            onClick={closeComposer}
            aria-label="Close"
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-default"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            title="Close"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Search results dropdown */}
        {search.showResults && (
          <div
            ref={inlineDropdownRef}
            onMouseDown={() => { interactingWithDropdownRef.current = true; }}
            onMouseUp={() => { setTimeout(() => { interactingWithDropdownRef.current = false; }, 300); }}
            className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface-elevated shadow-lg"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
          >
            <StatusFilterChips
              statuses={search.availableStatuses}
              activeStatuses={search.activeStatuses}
              onToggle={search.toggleStatus}
              onClear={search.clearStatusFilter}
            />
            {search.filteredResults.length > 0 ? (
              <HoverDataProvider keys={search.filteredResults.map((r) => r.key)}>
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
              </HoverDataProvider>
            ) : !search.isSearching ? (
              <div className="px-3 py-2.5 text-body-sm text-text-muted">
                No issues found for &ldquo;{search.query}&rdquo;
              </div>
            ) : null}

            {(search.isSearchingJira || search.isLoadingMore) && (
              <div className="flex items-center gap-2 border-t border-border-default px-3 py-2">
                <Loader2 size={11} className="animate-spin text-text-muted" />
                <span className="text-label text-text-muted">
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
            className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface-elevated py-1 shadow-lg"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
          >
            {referencedPicks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Link2 size={11} className="text-text-muted" strokeWidth={1.5} />
                  <span className="text-caption font-medium uppercase tracking-widest text-text-muted">
                    Referenced in this ticket
                  </span>
                </div>
                <HoverDataProvider keys={referencedPicks.map((r) => r.key)}>
                  {referencedPicks.map((r, idx) => (
                    <LinkSearchResultRow
                      key={r.key}
                      result={r}
                      highlighted={idx === search.highlightIndex}
                      onSelect={handleInlineLink}
                      onHover={() => search.setHighlightIndex(idx)}
                    />
                  ))}
                </HoverDataProvider>
              </>
            )}
            {dedupedRecentPicks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Clock size={11} className="text-text-muted" strokeWidth={1.5} />
                  <span className="text-caption font-medium uppercase tracking-widest text-text-muted">
                    Recently updated
                  </span>
                </div>
                <HoverDataProvider keys={dedupedRecentPicks.map((r) => r.key)}>
                  {dedupedRecentPicks.map((r, idx) => {
                    const highlightIdx = referencedPicks.length + idx;
                    return (
                      <LinkSearchResultRow
                        key={r.key}
                        result={r}
                        highlighted={highlightIdx === search.highlightIndex}
                        onSelect={handleInlineLink}
                        onHover={() => search.setHighlightIndex(highlightIdx)}
                      />
                    );
                  })}
                </HoverDataProvider>
              </>
            )}
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
        sectionKey={isEmpty ? undefined : SECTION_KEYS.linkedIssues}
        collapsed={isEmpty ? collapsed : undefined}
        onToggle={isEmpty ? () => setEmptyExpanded((v) => !v) : undefined}
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
                  const composite = `${item.key}:${item.relation}`;

                  return (
                    <LinkedIssueRow
                      key={composite}
                      item={item}
                      isLast={idx === items.length - 1}
                      isPending={Boolean(isPending)}
                      onSelect={!isPending ? onSelectTicket : undefined}
                      isActive={item.key === activeKey}
                      boardTicket={boardTicketByKey.get(item.key)}
                      actionsSlot={!isPending ? (
                        <>
                          <ChangeTypeButton
                            onClick={() => setEditingKey((cur) => (cur === composite ? null : composite))}
                            active={editingKey === composite}
                            disabled={retypingKeys.has(composite)}
                          />
                          <DeleteButton onClick={() => handleDelete(item)} />
                        </>
                      ) : undefined}
                    />
                  );
                })}
              </div>
              {/* Per-row change-type editor (BRDG-385): rendered under the group, not in the
                  hover-only actions overlay, so its picker stays open and unclipped. */}
              {(() => {
                const editingItem = items.find((i) => `${i.key}:${i.relation}` === editingKey);
                if (!editingItem) return null;
                return (
                  <div ref={editPanelRef} className="mt-2 rounded-lg bg-surface-chrome/40 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-label font-medium uppercase tracking-wider text-text-muted">
                      <ArrowLeftRight size={11} strokeWidth={1.5} />
                      <span>Change link type for <span className="font-mono normal-case text-text-secondary">{editingItem.key}</span></span>
                    </div>
                    <RelationPicker
                      value={editingItem.relation}
                      linkTypes={linkTypes}
                      onSelect={(v) => handleChangeType(editingItem, v)}
                      onClose={() => setEditingKey(null)}
                      className="w-full max-w-[260px]"
                    />
                  </div>
                );
              })()}
              {composerAt === relation && linkComposer}
            </div>
          ))}
        </div>
      )}

      {/* Header "+" opens the composer at the bottom; a group "+" opens it within that group. */}
      {composerAt === "__bottom__" && linkComposer}

      {/* Row-level action errors (delete, change-type) surface here when the composer that
          normally hosts the inline error isn't open, so they're never silently swallowed. */}
      {inlineError && composerAt === null && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-body-sm text-red-400/90">
          {inlineError}
        </div>
      )}

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
