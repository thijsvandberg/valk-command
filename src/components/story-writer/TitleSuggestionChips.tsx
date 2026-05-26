"use client";

import { useState } from "react";
import { Check, Type } from "lucide-react";

interface TitleSuggestionChipsProps {
  titles: string[];
  onApply: (title: string) => void;
  currentTitle?: string;
}

export function TitleSuggestionChips({ titles, onApply, currentTitle }: TitleSuggestionChipsProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  if (titles.length === 0) return null;

  const handleApply = (title: string) => {
    setClicked(title);
    onApply(title);
  };

  return (
    <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default">
        <Type size={10} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Title suggestions
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {titles.map((title, i) => {
          const isSelected = clicked === title || currentTitle === title;
          return (
            <div
              key={title}
              className={`group flex items-center gap-3 px-3 py-2 transition-colors duration-150 ${
                isSelected
                  ? "bg-[var(--color-brand-500)]/[0.06]"
                  : "hover:bg-overlay-subtle"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-caption font-medium transition-colors duration-150 ${
                  isSelected
                    ? "bg-[var(--color-brand-500)]/[0.15] text-[var(--color-brand-500)]"
                    : "bg-overlay-default text-text-muted"
                }`}
              >
                {isSelected
                  ? <Check size={10} strokeWidth={2.5} />
                  : <span className="tabular-nums">{i + 1}</span>}
              </span>
              <span
                className={`flex-1 text-body-sm leading-[1.6] ${
                  isSelected ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                {title}
              </span>
              {isSelected ? (
                <span className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
                  Applied
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleApply(title)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150"
                >
                  Use
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
