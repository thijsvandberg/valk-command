"use client";

import { Sparkles, Check, X, Loader2, AlertCircle, XCircle, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { IssueType, RelatedSuggestionResponse } from "@/types/ticket";

export interface RelatedSuggestion {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  relevance: number;
  suggestedRelation: string;
  reason: string | null;
}

export function toRelatedSuggestion(row: RelatedSuggestionResponse): RelatedSuggestion {
  return {
    id: row.id,
    key: row.suggestedKey,
    title: row.title,
    type: (row.issueType as IssueType) ?? "task",
    relevance: row.score,
    suggestedRelation: row.suggestedRelation,
    reason: row.reason,
  };
}

interface RelatedSuggestionsProps {
  suggestions: RelatedSuggestion[];
  isLoading: boolean;
  progressText: string | null;
  error: string | null;
  linkingKeys: Set<string>;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAccept: (suggestion: RelatedSuggestion) => void;
  onDecline: (suggestion: RelatedSuggestion) => void;
  onDeclineAll: () => void;
  onRegenerate: () => void;
}

export function RelatedSuggestions({
  suggestions,
  isLoading,
  progressText,
  error,
  linkingKeys,
  isExpanded,
  onToggleExpanded,
  onAccept,
  onDecline,
  onDeclineAll,
  onRegenerate,
}: RelatedSuggestionsProps) {
  if (!isLoading && !error && suggestions.length === 0) return null;

  const hasContent = isLoading || !!error || suggestions.length > 0;

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.03]"
      style={{
        boxShadow: "0 1px 3px color-mix(in srgb, var(--color-brand-600) 6%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-brand-600) 3%, transparent)",
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 hover:bg-[var(--color-brand-500)]/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease" }}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          className="shrink-0 text-text-muted"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-brand-500)]/10">
          <Sparkles size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
        </div>
        <span className="text-body-sm font-semibold tracking-tight text-text-secondary">
          AI Suggestions
        </span>
        {suggestions.length > 0 && !isLoading && (
          <span className="rounded-full bg-[var(--color-brand-500)]/10 px-1.5 py-0.5 text-caption font-medium tabular-nums text-[var(--color-brand-400)]">
            {suggestions.length}
          </span>
        )}
        {isLoading && (
          <Loader2 size={11} className="animate-spin text-[var(--color-brand-400)]" />
        )}
        {!isLoading && isExpanded && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={11} strokeWidth={2} />}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
            >
              Regenerate
            </Button>
            {suggestions.length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<XCircle size={11} strokeWidth={2} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeclineAll();
                }}
              >
                Decline all
              </Button>
            )}
          </div>
        )}
      </button>

      {isExpanded && hasContent && (
        <div className="border-t border-[var(--color-brand-500)]/10 px-1.5 py-1.5">
          {isLoading ? (
            <div className="flex items-center gap-2.5 px-2.5 py-3.5">
              <Loader2 size={13} className="animate-spin text-[var(--color-brand-400)]" />
              <span className="text-body-sm text-text-muted">
                {progressText ?? "Searching for related issues..."}
              </span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2.5 px-2.5 py-3.5">
              <AlertCircle size={13} className="shrink-0 text-red-400" />
              <span className="text-body-sm text-text-muted">{error}</span>
            </div>
          ) : (
            <div className="space-y-px">
              {suggestions.map((s) => {
                const isLinking = linkingKeys.has(s.key);

                return (
                  <div
                    key={s.key}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                      isLinking
                        ? "opacity-40"
                        : "hover:bg-[var(--color-brand-500)]/[0.05] active:bg-[var(--color-brand-500)]/[0.08]"
                    }`}
                    style={{ transition: "background-color 0.15s ease, opacity 0.15s ease" }}
                  >
                    {isLinking ? (
                      <Loader2 size={11} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
                    ) : (
                      <IssueTypeIcon type={s.type} size={13} />
                    )}

                    <span className="shrink-0 font-mono text-body-sm text-[var(--color-brand-400)]">{s.key}</span>
                    <span className="min-w-0 flex-1 truncate text-body leading-snug text-text-secondary">{s.title}</span>

                    <div className="flex shrink-0 items-center gap-1">
                      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-overlay-default">
                        <div
                          className="h-full rounded-full bg-[var(--color-brand-500)]"
                          style={{ width: `${Math.round(s.relevance * 100)}%` }}
                        />
                      </div>
                      <span className="text-caption tabular-nums text-text-muted">{Math.round(s.relevance * 100)}%</span>
                    </div>

                    <span className="shrink-0 rounded bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-muted">
                      {s.suggestedRelation}
                    </span>

                    {!isLinking && (
                      <div
                        className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md pl-6 pr-1 opacity-0 group-hover:opacity-100"
                        style={{
                          transition: "opacity 0.15s ease",
                          background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--color-brand-500) 3%, var(--color-surface-base)) 24px)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onAccept(s)}
                          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-[var(--color-brand-500)]/15"
                          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                          aria-label={`Accept and link ${s.key}`}
                        >
                          <Check size={14} strokeWidth={2.5} />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecline(s)}
                          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-label font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
                          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                          aria-label={`Decline ${s.key}`}
                        >
                          <X size={14} strokeWidth={2} />
                          <span>Decline</span>
                        </button>
                      </div>
                    )}

                    {s.reason && (
                      <p className="absolute left-[42px] top-full -mt-0.5 text-caption leading-relaxed text-text-muted sr-only group-hover:not-sr-only">
                        {s.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
