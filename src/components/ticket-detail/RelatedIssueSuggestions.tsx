"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Button } from "@/components/ui/Button";
import { Sparkles, X, Link as LinkIcon, Loader2, AlertCircle } from "lucide-react";
import { tickets } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import type { IssueType, RelatedSuggestionResponse } from "@/types/ticket";

export interface RelatedSuggestion {
  key: string;
  title: string;
  type: IssueType;
  relevance: number;
  suggestedRelation: string;
  reason: string | null;
}

function toSuggestion(row: RelatedSuggestionResponse): RelatedSuggestion {
  return {
    key: row.suggestedKey,
    title: row.title,
    type: (row.issueType as IssueType) ?? "task",
    relevance: row.score,
    suggestedRelation: row.suggestedRelation,
    reason: row.reason,
  };
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
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [streamTaskId, setStreamTaskId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useTaskStream(streamTaskId, {
    timeout: 0,
    onProgress: (message) => {
      if (!cancelledRef.current) setProgressText(message);
    },
    onToolCall: (tool) => {
      const cleanName = tool.replace("mcp__jira__", "").replace("mcp__", "");
      if (!cancelledRef.current) setProgressText(`Using ${cleanName}...`);
    },
    onResult: async (resultData) => {
      if (cancelledRef.current) return;
      setProgressText("Processing results...");
      const output = (resultData.output as string) ?? "";
      try {
        const parsed = await tickets.applyRelatedSuggestions(ticketKey, { output });
        if (cancelledRef.current) return;
        setSuggestions(parsed.suggestions.map(toSuggestion));
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to process results");
      }
      setHasSearched(true);
      setIsLoading(false);
      setProgressText(null);
    },
    onError: (message) => {
      if (cancelledRef.current) return;
      setError(message);
      setHasSearched(true);
      setIsLoading(false);
      setProgressText(null);
    },
    onNetworkError: () => {
      if (cancelledRef.current) return;
      setError("Connection to workspace lost");
      setHasSearched(true);
      setIsLoading(false);
      setProgressText(null);
    },
  });

  useEffect(() => {
    cancelledRef.current = false;

    async function discover() {
      try {
        const data = await tickets.findRelatedSuggestions(ticketKey);
        if (cancelledRef.current) return;

        if (data.cached && data.suggestions) {
          setSuggestions(data.suggestions.map(toSuggestion));
          setHasSearched(true);
          setIsLoading(false);
          return;
        }

        if (data.taskId) {
          setProgressText("Starting search...");
          setStreamTaskId(data.taskId);
          return;
        }

        setHasSearched(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to find related issues");
        setHasSearched(true);
        setIsLoading(false);
      }
    }

    discover();

    return () => {
      cancelledRef.current = true;
      setStreamTaskId(null);
    };
  }, [ticketKey]);

  const handleDismiss = useCallback((key: string) => {
    setSuggestions((prev) => prev.filter((s) => s.key !== key));
  }, []);

  return (
    <div className="mt-4 rounded-lg border border-border-default bg-[var(--color-surface-default)]">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Sparkles size={13} strokeWidth={2} className="text-[var(--color-brand-400)]" />
        <span className="text-body-sm font-medium text-text-secondary">AI-Suggested Related Issues</span>
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
            <span className="text-body-sm text-text-muted">
              {progressText ?? "Analyzing ticket for related issues..."}
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-3">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <span className="text-body-sm text-text-muted">{error}</span>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-1">
            {suggestions.map((s) => (
              <div key={s.key} className="group rounded-md px-2 py-1.5 hover:bg-overlay-default transition-colors duration-100">
                <div className="flex items-center gap-2.5">
                  <IssueTypeIcon type={s.type} size={13} />
                  <span className="shrink-0 font-mono text-body-sm text-[var(--color-brand-400)]">{s.key}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{s.title}</span>
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
                {s.reason && (
                  <p className="mt-0.5 pl-[21px] text-[10px] leading-relaxed text-text-muted">{s.reason}</p>
                )}
              </div>
            ))}
          </div>
        ) : hasSearched ? (
          <div className="py-3 text-center">
            <p className="text-body-sm text-text-muted">No related issues found.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
