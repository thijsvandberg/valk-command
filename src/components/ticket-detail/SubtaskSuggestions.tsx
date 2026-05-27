"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Check, X, Loader2, AlertCircle, CheckCheck, ChevronRight, SquarePen, RefreshCw } from "lucide-react";
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
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAdd: (index: number, editedTitle?: string) => void;
  onAddAll: () => void;
  onDismiss: (index: number) => void;
  onRegenerate: () => void;
}

export function SubtaskSuggestions({
  suggestions,
  isLoading,
  progressText,
  error,
  addingIndices,
  isExpanded,
  onToggleExpanded,
  onAdd,
  onAddAll,
  onDismiss,
  onRegenerate,
}: SubtaskSuggestionsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  if (!isLoading && !error && suggestions.length === 0) return null;

  const hasContent = isLoading || !!error || suggestions.length > 0;

  function startEditing(idx: number) {
    setEditValue(suggestions[idx].title);
    setEditingIndex(idx);
  }

  function cancelEditing() {
    setEditingIndex(null);
    setEditValue("");
  }

  function confirmEdit(idx: number) {
    const trimmed = editValue.trim();
    if (trimmed) {
      onAdd(idx, trimmed);
    }
    setEditingIndex(null);
    setEditValue("");
  }

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.03]"
      style={{
        boxShadow: "0 1px 3px rgba(var(--color-brand-rgb, 0 0 0) / 0.06), 0 0 0 1px rgba(var(--color-brand-rgb, 0 0 0) / 0.03)",
      }}
    >
      {/* Header - clickable to toggle */}
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
        <span className="text-xs font-semibold tracking-tight text-text-secondary">
          AI Suggestions
        </span>
        {suggestions.length > 0 && !isLoading && (
          <span className="rounded-full bg-[var(--color-brand-500)]/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-brand-400)]">
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
                variant="soft"
                size="sm"
                icon={<CheckCheck size={11} strokeWidth={2} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddAll();
                }}
                disabled={addingIndices.size > 0}
              >
                Add all
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
              const isEditing = editingIndex === idx;

              return (
                <div
                  key={suggestion.id}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
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

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmEdit(idx);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditing();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-brand-500)]/20 bg-white px-2 py-1 text-[13px] leading-snug text-text-secondary outline-none focus:border-[var(--color-brand-400)] focus:ring-1 focus:ring-[var(--color-brand-400)]/30 dark:bg-surface-base"
                      aria-label={`Edit suggestion: ${suggestion.title}`}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-text-secondary">
                      {suggestion.title}
                    </span>
                  )}

                  {!isAdding && (
                    <div
                      className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md pl-6 pr-1 ${isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      style={{
                        transition: "opacity 0.15s ease",
                        background: isEditing ? "transparent" : "linear-gradient(to right, transparent, var(--color-surface-base) 24px)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => isEditing ? confirmEdit(idx) : onAdd(idx)}
                        className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-[var(--color-brand-500)]/15"
                        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                        aria-label={`Accept subtask: ${suggestion.title}`}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => isEditing ? cancelEditing() : onDismiss(idx)}
                        className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-red-500/15"
                        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                        aria-label={isEditing ? "Cancel editing" : `Decline subtask: ${suggestion.title}`}
                      >
                        <X size={14} strokeWidth={2} />
                        <span>{isEditing ? "Cancel" : "Decline"}</span>
                      </button>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startEditing(idx)}
                          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80"
                          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                          aria-label={`Edit subtask: ${suggestion.title}`}
                        >
                          <SquarePen size={13} strokeWidth={2} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
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
