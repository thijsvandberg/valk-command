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
    <div className="mt-2.5 overflow-hidden rounded-lg border border-white/[0.07]">
      {titles.map((title, i) => {
        const isSelected = selected === title;
        return (
          <div
            key={title}
            className={[
              "flex items-center gap-3 px-3 py-2 transition-colors duration-150",
              i > 0 ? "border-t border-white/[0.05]" : "",
              isSelected ? "bg-[var(--color-brand-500)]/[0.07]" : "hover:bg-white/[0.025]",
            ].join(" ")}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {isSelected ? (
                <Check size={10} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
              ) : (
                <span className="font-mono text-[10px] tabular-nums text-white/20 select-none">
                  {i + 1}
                </span>
              )}
            </span>
            <span
              className={[
                "flex-1 text-[12px] leading-snug",
                isSelected ? "text-white/80" : "text-white/60",
              ].join(" ")}
            >
              {title}
            </span>
            <button
              type="button"
              onClick={() => handleApply(title)}
              className={[
                "shrink-0 text-[10px] font-medium cursor-pointer transition-colors duration-150",
                isSelected
                  ? "text-[var(--color-brand-400)]/60 pointer-events-none"
                  : "text-white/25 hover:text-[var(--color-brand-400)]",
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
