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
    <div className="mt-2.5 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/25 select-none">
        Title options
      </p>
      <div className="flex flex-col gap-0.5">
        {titles.map((title) => {
          const isSelected = selected === title;
          return (
            <div
              key={title}
              className={[
                "flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150",
                isSelected
                  ? "bg-[var(--color-brand-500)]/[0.07]"
                  : "hover:bg-white/[0.03]",
              ].join(" ")}
            >
              <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {isSelected ? (
                  <Check size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
                ) : (
                  <span className="block h-[4px] w-[4px] rounded-full bg-white/20" />
                )}
              </span>
              <span className="flex-1 text-[13px] leading-snug text-white/75">
                {title}
              </span>
              <button
                type="button"
                onClick={() => handleApply(title)}
                className={[
                  "mt-px shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors duration-150",
                  isSelected
                    ? "border-[var(--color-brand-500)]/25 text-[var(--color-brand-400)]/70"
                    : "border-white/[0.10] text-white/35 hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-400)]",
                ].join(" ")}
              >
                {isSelected ? "Applied" : "Use"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
