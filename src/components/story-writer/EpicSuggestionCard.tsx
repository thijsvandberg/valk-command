"use client";

import { useState } from "react";
import { Target, Loader2 } from "lucide-react";

export interface EpicSuggestion {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "rgba(74, 170, 96, 0.15)", text: "#4aaa60", label: "High" },
  medium: { bg: "rgba(234, 179, 8, 0.12)", text: "#eab308", label: "Med" },
  low: { bg: "rgba(155, 108, 212, 0.10)", text: "#9b6cd4", label: "Low" },
};

interface EpicSuggestionCardProps {
  suggestions: EpicSuggestion[];
  currentEpicKey: string | null | undefined;
  onApply: (epicKey: string) => Promise<void>;
}

export function EpicSuggestionCard({ suggestions, currentEpicKey, onApply }: EpicSuggestionCardProps) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Set<string>>(new Set());

  if (suggestions.length === 0) return null;

  const handleApply = async (epicKey: string) => {
    setApplying((prev) => new Set(prev).add(epicKey));
    setErrors((prev) => { const next = new Set(prev); next.delete(epicKey); return next; });
    try {
      await onApply(epicKey);
      setApplied((prev) => new Set(prev).add(epicKey));
    } catch {
      setErrors((prev) => new Set(prev).add(epicKey));
    } finally {
      setApplying((prev) => { const next = new Set(prev); next.delete(epicKey); return next; });
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default">
        <Target size={10} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Epic suggestion
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {suggestions.map((s) => {
          const isCurrent = currentEpicKey === s.key;
          const justApplied = applied.has(s.key);
          const isApplying = applying.has(s.key);
          const hasError = errors.has(s.key);
          const conf = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;

          return (
            <div
              key={s.key}
              className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors duration-150 ${
                isCurrent || justApplied
                  ? "bg-[var(--color-brand-500)]/[0.04]"
                  : "hover:bg-overlay-subtle"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-label font-bold text-text-secondary">
                    {s.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-label text-text-secondary">
                    {s.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium"
                    style={{ backgroundColor: conf.bg, color: conf.text }}
                  >
                    {conf.label}
                  </span>
                </div>
                <span className="text-caption text-text-muted leading-[1.5]">
                  {s.reason}
                </span>
              </div>
              <div className="shrink-0 self-center">
                {isCurrent ? (
                  <span className="rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
                    Current
                  </span>
                ) : justApplied ? (
                  <span className="rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
                    Linked
                  </span>
                ) : hasError ? (
                  <button
                    type="button"
                    onClick={() => handleApply(s.key)}
                    className="shrink-0 text-caption font-medium text-red-400 cursor-pointer hover:text-red-300 transition-colors duration-150"
                  >
                    Retry
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApply(s.key)}
                    disabled={isApplying}
                    className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150 disabled:opacity-50"
                  >
                    {isApplying ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      "Link"
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
