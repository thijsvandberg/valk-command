"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { TicketDetail, LinkedIssue } from "@/types/ticket";
import { Avatar } from "@/components/shared/Avatar";
import { ChildIssueRow } from "./ChildIssueRow";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { LinkIssueDialog } from "./LinkIssueDialog";
import { useLinkTypes } from "@/hooks/useLinkTypes";
import { RelatedSuggestions, toRelatedSuggestion, type RelatedSuggestion } from "./RelatedIssueSuggestions";
import { tickets } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError, isRetryableStreamError } from "@/lib/agent-errors";
import { StatusBadge as SearchStatusBadge } from "@/components/sprint-board/SearchResultParts";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { IssueType } from "@/types/ticket";
import { X, Sparkles, Loader2, Link2, Cloud, ChevronDown } from "lucide-react";

interface LinkedIssuesSectionProps {
  issues: TicketDetail["linkedIssues"];
  ticketKey: string;
  onMutate: () => void;
}

interface InlineSearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source?: "local" | "jira";
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
  const [linkDialogDefaults, setLinkDialogDefaults] = useState<{ targetKey?: string; relation?: string }>({});

  // Inline link input state
  const [inlineRelation, setInlineRelation] = useState("relates to");
  const [inlineRelationOpen, setInlineRelationOpen] = useState(false);
  const [inlineRelationFilter, setInlineRelationFilter] = useState("");
  const inlineRelationRef = useRef<HTMLDivElement>(null);
  const inlineRelationFilterRef = useRef<HTMLInputElement>(null);
  const [inlineQuery, setInlineQuery] = useState("");
  const [inlineResults, setInlineResults] = useState<InlineSearchResult[]>([]);
  const [inlineHighlight, setInlineHighlight] = useState(-1);
  const [inlineShowResults, setInlineShowResults] = useState(false);
  const [inlineSearching, setInlineSearching] = useState(false);
  const [inlinePending, setInlinePending] = useState<LinkedIssue[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const inlineDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

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

  // Prune deletingKeys once SWR re-fetch has removed items from issues
  useEffect(() => {
    if (deletingKeys.size === 0) return;
    const issueIds = new Set(issues.map((i) => `${i.key}:${i.relation}`));
    const stale = [...deletingKeys].filter((id) => !issueIds.has(id));
    if (stale.length > 0) {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        stale.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [issues, deletingKeys]);

  // Close relation dropdown on Esc or click outside
  useEffect(() => {
    if (!inlineRelationOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setInlineRelationOpen(false);
      }
    }
    function handleClick(e: MouseEvent) {
      if (inlineRelationRef.current && !inlineRelationRef.current.contains(e.target as Node)) {
        setInlineRelationOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
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
      // Keep deleteId in deletingKeys until SWR re-fetch removes it from issues
    } catch (err) {
      // Restore the item on failure
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(deleteId);
        return next;
      });
      setInlineError(`Failed to remove link to ${item.key}`);
      console.error("Failed to delete link:", err);
    }
  }, [ticketKey, onMutate]);

  const openLinkDialog = useCallback((defaults?: { targetKey?: string; relation?: string }) => {
    setLinkDialogDefaults(defaults ?? {});
    setShowLinkDialog(true);
  }, []);

  const handleLinkCreated = useCallback(() => {
    setShowLinkDialog(false);
    setLinkDialogDefaults({});
    onMutate();
  }, [onMutate]);

  // Inline search with two-phase Jira fallback
  const inlineJiraDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inlineAbortRef = useRef<AbortController | null>(null);
  const [inlineSearchingJira, setInlineSearchingJira] = useState(false);

  const doInlineSearch = useCallback((q: string) => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    if (inlineJiraDebounceRef.current) clearTimeout(inlineJiraDebounceRef.current);
    if (inlineAbortRef.current) inlineAbortRef.current.abort();

    if (q.length < 2) {
      setInlineResults([]);
      setInlineShowResults(false);
      setInlineSearchingJira(false);
      return;
    }
    setInlineSearching(true);
    inlineDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      inlineAbortRef.current = controller;
      try {
        const data = await tickets.searchForLink(q, ticketKey, controller.signal);
        if (controller.signal.aborted) return;
        setInlineResults(data);
        setInlineShowResults(true);
        setInlineHighlight(-1);
        setInlineSearching(false);

        if (data.length < 5) {
          setInlineSearchingJira(true);
          inlineJiraDebounceRef.current = setTimeout(async () => {
            try {
              const fullData = await tickets.searchForLinkWithJira(q, ticketKey, controller.signal);
              if (controller.signal.aborted) return;
              setInlineResults(fullData);
              setInlineHighlight(-1);
            } catch {
              // Keep local results
            } finally {
              setInlineSearchingJira(false);
            }
          }, 300);
        }
      } catch {
        if (!controller.signal.aborted) {
          setInlineResults([]);
          setInlineSearching(false);
        }
      }
    }, 250);
  }, [ticketKey]);

  const handleInlineQueryChange = useCallback((value: string) => {
    const urlMatch = value.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const cleaned = urlMatch ? urlMatch[1].toUpperCase() : value;
    setInlineQuery(cleaned);
    setInlineError(null);
    doInlineSearch(cleaned);
  }, [doInlineSearch]);

  const handleInlineLink = useCallback((result: InlineSearchResult) => {
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
    setInlineQuery("");
    setInlineResults([]);
    setInlineShowResults(false);
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
  }, [ticketKey, issues, inlinePending, inlineRelation, onMutate]);

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!inlineShowResults || inlineResults.length === 0) {
      if (e.key === "Escape") {
        setInlineQuery("");
        inlineInputRef.current?.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setInlineHighlight((i) => Math.min(i + 1, inlineResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setInlineHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = inlineHighlight >= 0 ? inlineHighlight : 0;
      if (idx < inlineResults.length) {
        handleInlineLink(inlineResults[idx]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInlineShowResults(false);
      setInlineQuery("");
      inlineInputRef.current?.blur();
    }
  }, [inlineShowResults, inlineResults, inlineHighlight, handleInlineLink]);

  const allIssues = [
    ...issues.filter((i) => !deletingKeys.has(`${i.key}:${i.relation}`)),
    ...inlinePending.filter((p) => !issues.some((i) => i.key === p.key && i.relation === p.relation)),
  ];

  const grouped = allIssues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  const suggestButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (suggestions.length > 0) {
            setSuggestionsExpanded(true);
          } else {
            handleSuggest();
            setSuggestionsExpanded(true);
          }
        }}
        disabled={suggestLoading}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 ${
          suggestLoading
            ? "text-[var(--color-brand-400)]"
            : suggestions.length > 0
              ? "text-[var(--color-brand-400)]"
              : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title={suggestions.length > 0 ? `${suggestions.length} pending AI suggestions` : "Find related issues with AI"}
      >
        {suggestLoading ? (
          <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <Sparkles size={13} strokeWidth={1.5} />
        )}
      </button>
      {suggestions.length > 0 && !suggestLoading && (
        <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-0.5 text-[9px] font-semibold text-white">
          {suggestions.length}
        </span>
      )}
    </div>
  );

  return (
    <div className="mt-8">
      <SectionHeader
        title="Linked Issues"
        count={allIssues.length}
        actions={suggestButton}
      />

      {allIssues.length > 0 && (
        <div className="mt-3 space-y-4">
          {Object.entries(grouped).map(([relation, items]) => (
            <div key={relation}>
              <div className="mb-2 text-label font-medium uppercase tracking-wider text-text-muted">
                {relation}
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
            </div>
          ))}
        </div>
      )}

      {/* Inline link input */}
      <div className="relative mt-3 rounded-lg border border-border-default">
        <div className="flex items-center gap-3 px-3 py-2">
          <div ref={inlineRelationRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setInlineRelationOpen((v) => {
                  if (!v) {
                    setInlineRelationFilter("");
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
                    onChange={(e) => setInlineRelationFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
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
                    .map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setInlineRelation(opt.value);
                        setInlineRelationOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-body-sm cursor-pointer transition-colors duration-150 ${
                        inlineRelation === opt.value
                          ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
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
            value={inlineQuery}
            onChange={(e) => handleInlineQueryChange(e.target.value)}
            onKeyDown={handleInlineKeyDown}
            onFocus={() => inlineResults.length > 0 && setInlineShowResults(true)}
            onBlur={() => setTimeout(() => setInlineShowResults(false), 200)}
            placeholder="Link issue..."
            className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
          />
          {inlineSearching && <Loader2 size={13} className="shrink-0 animate-spin text-text-muted" />}
        </div>
        {inlineShowResults && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-overlay-strong) transparent" }}
          >
            {inlineResults.length > 0 ? inlineResults.map((r, idx) => (
              <button
                key={r.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleInlineLink(r); }}
                onMouseEnter={() => setInlineHighlight(idx)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
                style={{
                  borderLeft: idx === inlineHighlight ? "2px solid var(--color-brand-400)" : "2px solid transparent",
                  backgroundColor: idx === inlineHighlight ? "var(--color-overlay-subtle)" : undefined,
                  transition: "background-color 80ms, border-color 80ms",
                }}
              >
                <IssueTypeIcon type={r.type as IssueType} size={13} />
                <span className="shrink-0 font-mono text-body-sm text-[var(--color-brand-400)]">{r.key}</span>
                <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{r.title}</span>
                <SearchStatusBadge status={r.status} />
                {r.source === "jira" && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: "var(--color-status-info-subtle)", color: "var(--color-status-info)" }}
                  >
                    <Cloud size={9} strokeWidth={2} />
                    Jira
                  </span>
                )}
              </button>
            )) : !inlineSearching ? (
              <div className="px-3 py-2.5 text-body-sm text-text-muted">
                No issues found for &ldquo;{inlineQuery}&rdquo;
              </div>
            ) : null}
            {inlineSearchingJira && (
              <div className="flex items-center gap-2 border-t border-border-default px-3 py-2">
                <Loader2 size={11} className="animate-spin text-text-muted" />
                <span className="text-[11px] text-text-muted">Searching Jira...</span>
              </div>
            )}
          </div>
        )}
        {inlineError && (
          <div className="border-t border-border-default px-3 py-2 text-body-sm text-red-400/80">
            {inlineError}
          </div>
        )}
      </div>

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
        defaultTargetKey={linkDialogDefaults.targetKey}
        defaultRelation={linkDialogDefaults.relation}
      />
    </div>
  );
}
