"use client";

import { Sparkles, Plus, X, Loader2, AlertCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SubtaskSuggestionItem {
  id: string;
  title: string;
}

interface SubtaskSuggestionsProps {
  suggestions: SubtaskSuggestionItem[];
  isLoading: boolean;
  progressText: string | null;
  error: string | null;
  addingIndices: Set<number>;
  onAdd: (index: number) => void;
  onAddAll: () => void;
  onDismiss: (index: number) => void;
}

export function SubtaskSuggestions({
  suggestions,
  isLoading,
  progressText,
  error,
  addingIndices,
  onAdd,
  onAddAll,
  onDismiss,
}: SubtaskSuggestionsProps) {
  if (!isLoading && !error && suggestions.length === 0) return null;

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.03]"
      style={{
        boxShadow: "0 1px 3px rgba(var(--color-brand-rgb, 0 0 0) / 0.06), 0 0 0 1px rgba(var(--color-brand-rgb, 0 0 0) / 0.03)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-brand-500)]/10 px-3.5 py-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-brand-500)]/10">
          <Sparkles size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
        </div>
        <span className="text-xs font-semibold tracking-tight text-text-secondary">
          AI Suggestions
        </span>
        {suggestions.length > 0 && !isLoading && (
          <span className="rounded-full bg-[var(--color-brand-500)]/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-brand-400)]">
            {suggestions.length}
          </span>
        )}
        {suggestions.length >= 2 && !isLoading && (
          <Button
            variant="soft"
            size="sm"
            icon={<CheckCheck size={11} strokeWidth={2} />}
            onClick={onAddAll}
            className="ml-auto"
            disabled={addingIndices.size > 0}
          >
            Add all
          </Button>
        )}
      </div>

      <div className="px-1.5 py-1.5">
        {isLoading ? (
          <div className="flex items-center gap-2.5 px-2.5 py-3.5">
            <Loader2 size={13} className="animate-spin text-[var(--color-brand-400)]" />
            <span className="text-xs text-text-muted">
              {progressText ?? "Generating subtask suggestions..."}
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2.5 px-2.5 py-3.5">
            <AlertCircle size={13} className="shrink-0 text-red-400" />
            <span className="text-xs text-text-muted">{error}</span>
          </div>
        ) : (
          <div className="space-y-px">
            {suggestions.map((suggestion, idx) => {
              const isAdding = addingIndices.has(idx);
              return (
                <div
                  key={suggestion.id}
                  className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                    isAdding
                      ? "opacity-40"
                      : "hover:bg-[var(--color-brand-500)]/[0.05] active:bg-[var(--color-brand-500)]/[0.08]"
                  }`}
                  style={{ transition: "background-color 0.15s ease, opacity 0.15s ease" }}
                >
                  {isAdding ? (
                    <Loader2 size={11} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--color-brand-500)]/[0.08] text-[9px] font-semibold tabular-nums text-[var(--color-brand-400)]">
                      {idx + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-text-secondary">
                    {suggestion.title}
                  </span>
                  {!isAdding && (
                    <div
                      className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100"
                      style={{ transition: "opacity 0.15s ease" }}
                    >
                      <Button
                        variant="soft"
                        size="sm"
                        iconOnly
                        icon={<Plus size={11} strokeWidth={2.5} />}
                        onClick={() => onAdd(idx)}
                        aria-label={`Add subtask: ${suggestion.title}`}
                      />
                      <button
                        type="button"
                        onClick={() => onDismiss(idx)}
                        className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                        aria-label={`Dismiss suggestion: ${suggestion.title}`}
                      >
                        <X size={11} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
