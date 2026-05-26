"use client";

import { Sparkles, Plus, X, Loader2, AlertCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SubtaskSuggestionItem {
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
      className="mt-3 overflow-hidden rounded-lg border border-dashed border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.03]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-dashed border-[var(--color-brand-500)]/20 px-3 py-2">
        <Sparkles size={13} strokeWidth={2} className="text-[var(--color-brand-400)]" />
        <span className="text-xs font-medium text-text-secondary">AI-Suggested Subtasks</span>
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

      <div className="px-3 py-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 size={14} className="animate-spin text-text-muted" />
            <span className="text-xs text-text-muted">
              {progressText ?? "Generating subtask suggestions..."}
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-3">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <span className="text-xs text-text-muted">{error}</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {suggestions.map((suggestion, idx) => {
              const isAdding = addingIndices.has(idx);
              return (
                <div
                  key={suggestion.id}
                  className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 ${
                    isAdding ? "opacity-50" : "hover:bg-overlay-default"
                  }`}
                >
                  {isAdding ? (
                    <Loader2 size={11} className="shrink-0 animate-spin text-text-muted" />
                  ) : (
                    <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
                      {idx + 1}.
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {suggestion.title}
                  </span>
                  {!isAdding && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Button
                        variant="soft"
                        size="sm"
                        iconOnly
                        icon={<Plus size={11} strokeWidth={2} />}
                        onClick={() => onAdd(idx)}
                        aria-label={`Add subtask: ${suggestion.title}`}
                      />
                      <button
                        type="button"
                        onClick={() => onDismiss(idx)}
                        className="cursor-pointer rounded p-0.5 text-text-muted hover:text-text-secondary transition-colors duration-150"
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
