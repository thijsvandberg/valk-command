"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { TicketDetail, LinkedIssue, IssueType } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { LinkIssueDialog } from "./LinkIssueDialog";
import { RelatedIssueSuggestionsPanel, type RelatedSuggestion } from "./RelatedIssueSuggestions";
import { tickets } from "@/lib/api-client";
import { X, Sparkles, Loader2, Link2 } from "lucide-react";

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
}

export function LinkedIssuesSection({ issues, ticketKey, onMutate }: LinkedIssuesSectionProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogDefaults, setLinkDialogDefaults] = useState<{ targetKey?: string; relation?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState<LinkedIssue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Inline link input state
  const [inlineQuery, setInlineQuery] = useState("");
  const [inlineResults, setInlineResults] = useState<InlineSearchResult[]>([]);
  const [inlineHighlight, setInlineHighlight] = useState(-1);
  const [inlineShowResults, setInlineShowResults] = useState(false);
  const [inlineSearching, setInlineSearching] = useState(false);
  const [inlinePending, setInlinePending] = useState<LinkedIssue[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const inlineDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await tickets.deleteLink(ticketKey, {
        jiraLinkId: confirmDelete.jiraLinkId,
        linkedKey: confirmDelete.key,
      });
      onMutate();
    } catch (err) {
      console.error("Failed to delete link:", err);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  }, [confirmDelete, isDeleting, ticketKey, onMutate]);

  const openLinkDialog = useCallback((defaults?: { targetKey?: string; relation?: string }) => {
    setLinkDialogDefaults(defaults ?? {});
    setShowLinkDialog(true);
  }, []);

  const handleLinkCreated = useCallback(() => {
    setShowLinkDialog(false);
    setLinkDialogDefaults({});
    onMutate();
  }, [onMutate]);

  const handleLinkSuggestion = useCallback((suggestion: RelatedSuggestion) => {
    openLinkDialog({ targetKey: suggestion.key, relation: suggestion.suggestedRelation });
  }, [openLinkDialog]);

  // Inline search
  const doInlineSearch = useCallback((q: string) => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    if (q.length < 2) {
      setInlineResults([]);
      setInlineShowResults(false);
      return;
    }
    setInlineSearching(true);
    inlineDebounceRef.current = setTimeout(async () => {
      try {
        const data = await tickets.searchForLink(q, ticketKey);
        setInlineResults(data);
        setInlineShowResults(true);
        setInlineHighlight(-1);
      } catch {
        setInlineResults([]);
      } finally {
        setInlineSearching(false);
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
    const alreadyLinked = issues.some((i) => i.key === result.key) || inlinePending.some((i) => i.key === result.key);
    if (alreadyLinked) {
      setInlineError(`${result.key} is already linked`);
      return;
    }

    const placeholder: LinkedIssue = {
      key: result.key,
      title: result.title,
      type: result.type as LinkedIssue["type"],
      jiraStatus: result.status as LinkedIssue["jiraStatus"],
      assignee: null,
      relation: "relates to",
      jiraLinkId: `pending-${Date.now()}`,
    };
    setInlinePending((prev) => [...prev, placeholder]);
    setInlineQuery("");
    setInlineResults([]);
    setInlineShowResults(false);
    setInlineError(null);

    tickets.createLink(ticketKey, { targetKey: result.key, relation: "relates to" })
      .then(() => {
        setInlinePending((prev) => prev.filter((p) => p.key !== result.key));
        onMutate();
      })
      .catch((err) => {
        setInlinePending((prev) => prev.filter((p) => p.key !== result.key));
        setInlineError(`Failed to link ${result.key}`);
        console.error("Failed to create inline link:", err);
      });
  }, [ticketKey, issues, inlinePending, onMutate]);

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
      if (inlineHighlight >= 0 && inlineHighlight < inlineResults.length) {
        handleInlineLink(inlineResults[inlineHighlight]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInlineShowResults(false);
      setInlineQuery("");
      inlineInputRef.current?.blur();
    }
  }, [inlineShowResults, inlineResults, inlineHighlight, handleInlineLink]);

  const allIssues = [...issues, ...inlinePending.filter((p) => !issues.some((i) => i.key === p.key))];

  const grouped = allIssues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  return (
    <div className="mt-8">
      <SectionHeader
        title="Linked Issues"
        count={allIssues.length}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles size={12} strokeWidth={2} />}
              onClick={() => setShowSuggestions(true)}
              aria-label="Find related issues"
            >
              Find related
            </Button>
          </>
        }
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
                    <div
                      key={item.key}
                      className={`group flex items-center gap-3 px-3 py-2.5 ${
                        idx < items.length - 1 ? "border-b border-border-subtle" : ""
                      } ${isPending ? "opacity-50" : ""}`}
                    >
                      <IssueTypeIcon type={item.type} size={14} />
                      {isPending ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
                          <Loader2 size={10} className="animate-spin" />
                          {item.key}
                        </span>
                      ) : (
                        <Link
                          href={`/tickets/${item.key}`}
                          className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.key}
                        </Link>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{item.title}</span>
                      <StatusBadge status={item.jiraStatus} />
                      <Avatar assignee={item.assignee} size={22} />
                      {!isPending && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(item)}
                          className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 transition-opacity duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 group-hover:opacity-100"
                          aria-label={`Remove link to ${item.key}`}
                        >
                          <X size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline link input */}
      <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
        <div className="relative flex items-center gap-3 px-3 py-2">
          <Link2 size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          <input
            ref={inlineInputRef}
            type="text"
            value={inlineQuery}
            onChange={(e) => handleInlineQueryChange(e.target.value)}
            onKeyDown={handleInlineKeyDown}
            onFocus={() => inlineResults.length > 0 && setInlineShowResults(true)}
            onBlur={() => setTimeout(() => setInlineShowResults(false), 200)}
            placeholder="Link issue..."
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          {inlineSearching && <Loader2 size={13} className="shrink-0 animate-spin text-text-muted" />}
          {inlineShowResults && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]">
              {inlineResults.length > 0 ? inlineResults.map((r, idx) => (
                <button
                  key={r.key}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleInlineLink(r); }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 ${
                    idx === inlineHighlight ? "bg-overlay-strong" : "hover:bg-overlay-default"
                  }`}
                >
                  <IssueTypeIcon type={r.type as IssueType} size={13} />
                  <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{r.key}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{r.title}</span>
                </button>
              )) : (
                <div className="px-3 py-2.5 text-xs text-text-muted">
                  No issues found for &ldquo;{inlineQuery}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {inlineError && (
        <p className="mt-2 text-xs text-red-400/80">{inlineError}</p>
      )}

      {showSuggestions && (
        <RelatedIssueSuggestionsPanel
          ticketKey={ticketKey}
          onClose={() => setShowSuggestions(false)}
          onLinkSuggestion={handleLinkSuggestion}
        />
      )}

      <LinkIssueDialog
        open={showLinkDialog}
        onClose={() => { setShowLinkDialog(false); setLinkDialogDefaults({}); }}
        ticketKey={ticketKey}
        onLinked={handleLinkCreated}
        defaultTargetKey={linkDialogDefaults.targetKey}
        defaultRelation={linkDialogDefaults.relation}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove link"
        description={confirmDelete ? `Remove the "${confirmDelete.relation}" link to ${confirmDelete.key}?` : ""}
        confirmLabel="Remove"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
