"use client";

import { useState, useCallback } from "react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Button } from "@/components/ui/Button";
import { Sparkles, X, Link as LinkIcon, Loader2 } from "lucide-react";
import type { IssueType } from "@/types/ticket";

export interface RelatedSuggestion {
  key: string;
  title: string;
  type: IssueType;
  relevance: number;
  suggestedRelation: string;
}

interface RelatedIssueSuggestionsPanelProps {
  onClose: () => void;
  onLinkSuggestion: (suggestion: RelatedSuggestion) => void;
  ticketKey: string;
}

export function RelatedIssueSuggestionsPanel({
  onClose,
  onLinkSuggestion,
  ticketKey,
}: RelatedIssueSuggestionsPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<RelatedSuggestion[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Trigger search on mount
  useState(() => {
    // Backend integration deferred to BRDG-143
    const timer = setTimeout(() => {
      setSuggestions([]);
      setIsLoading(false);
      setHasSearched(true);
    }, 800);
    return () => clearTimeout(timer);
  });

  const handleDismiss = useCallback((key: string) => {
    setSuggestions((prev) => prev.filter((s) => s.key !== key));
  }, []);

  void ticketKey;

  return (
    <div className="mt-4 rounded-lg border border-border-default bg-[var(--color-surface-default)]">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Sparkles size={13} strokeWidth={2} className="text-[var(--color-brand-400)]" />
        <span className="text-xs font-medium text-text-secondary">AI-Suggested Related Issues</span>
        <span className="text-[10px] text-text-muted">(BRDG-143)</span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-0.5 text-text-muted hover:text-text-secondary transition-colors duration-150"
            aria-label="Close suggestions"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 size={14} className="animate-spin text-text-muted" />
            <span className="text-xs text-text-muted">Analyzing ticket for related issues...</span>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-1">
            {suggestions.map((s) => (
              <div key={s.key} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-overlay-default transition-colors duration-100">
                <IssueTypeIcon type={s.type} size={13} />
                <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{s.key}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{s.title}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-overlay-default">
                    <div
                      className="h-full rounded-full bg-[var(--color-brand-500)]"
                      style={{ width: `${Math.round(s.relevance * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-text-muted">{Math.round(s.relevance * 100)}%</span>
                </div>
                <span className="shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  {s.suggestedRelation}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon={<LinkIcon size={11} strokeWidth={2} />}
                  onClick={() => onLinkSuggestion(s)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  aria-label={`Link ${s.key}`}
                />
                <button
                  type="button"
                  onClick={() => handleDismiss(s.key)}
                  className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-secondary transition-opacity duration-150"
                  aria-label={`Dismiss ${s.key}`}
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        ) : hasSearched ? (
          <div className="py-3 text-center">
            <p className="text-xs text-text-muted">No related issues found.</p>
            <p className="mt-1 text-[10px] text-text-muted">Backend integration coming in BRDG-143.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
