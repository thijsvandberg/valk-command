"use client";

import { useState } from "react";
import { Check, ChevronDown, Type } from "lucide-react";
import { AppliedBadge } from "./SuggestionCard";

interface TitleSuggestionChipsProps {
  titles: string[];
  onApply: (title: string) => void;
  currentTitle?: string;
}

export function TitleSuggestionChips({ titles, onApply, currentTitle }: TitleSuggestionChipsProps) {
  const [clicked, setClicked] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (titles.length === 0) return null;

  const hasApplied = titles.some((t) => clicked === t || currentTitle === t);

  const handleApply = (title: string) => {
    setClicked(title);
    onApply(title);
  };

  return (
    <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex min-h-8 w-full items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default cursor-pointer hover:bg-overlay-default transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Type size={10} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Title suggestions
        </span>
        {hasApplied && <span className="ml-auto flex items-center mr-1.5"><AppliedBadge /></span>}
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`${hasApplied ? "" : "ml-auto "}shrink-0 text-text-muted transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
        />
      </button>
      {!collapsed && <div className="divide-y divide-border-subtle">
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
                  className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  Use
                </button>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
