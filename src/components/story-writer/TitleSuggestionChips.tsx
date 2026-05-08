"use client";

import { useState } from "react";
import { Check } from "lucide-react";

interface TitleSuggestionChipsProps {
  titles: string[];
  onApply: (title: string) => void;
}

export function TitleSuggestionChips({ titles, onApply }: TitleSuggestionChipsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (titles.length === 0) return null;

  const handleApply = (title: string) => {
    setSelected(title);
    onApply(title);
  };

  return (
    <div className="mt-1 space-y-0.5">
      {titles.map((title, i) => {
        const isSelected = selected === title;
        return (
          <div
            key={title}
            className={[
              "group flex items-center gap-2.5 rounded-md px-1 py-0.5 -mx-1 transition-colors duration-150",
              isSelected ? "bg-[var(--color-brand-500)]/[0.07]" : "hover:bg-overlay-subtle",
            ].join(" ")}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {isSelected
                ? <Check size={10} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
                : <span className="font-mono text-label tabular-nums text-text-muted select-none">{i + 1}</span>}
            </span>
            <span className={[
              "flex-1 leading-[1.75]",
              isSelected ? "text-text-primary" : "text-text-secondary",
            ].join(" ")}>
              {title}
            </span>
            <button
              type="button"
              onClick={() => handleApply(title)}
              disabled={isSelected}
              className={[
                "shrink-0 text-label font-medium cursor-pointer transition-colors duration-150",
                isSelected
                  ? "text-[var(--color-brand-400)]/60 pointer-events-none"
                  : "text-text-muted hover:text-[var(--color-brand-400)] group-hover:text-text-tertiary",
              ].join(" ")}
            >
              {isSelected ? "Applied" : "Use"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
