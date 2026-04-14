"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

const TITLE_TRUNCATE_LENGTH = 60;
const APPLIED_DISPLAY_MS = 1500;

interface TitleSuggestionChipsProps {
  titles: string[];
  onApply: (title: string) => void;
}

function TitleChip({
  title,
  isCurrent,
  isOther,
  disabled,
  onApply,
}: {
  title: string;
  isCurrent: boolean;
  isOther: boolean;
  disabled: boolean;
  onApply: (title: string) => void;
}) {
  const truncated = title.length > TITLE_TRUNCATE_LENGTH;
  const displayTitle = truncated ? title.slice(0, TITLE_TRUNCATE_LENGTH) + "…" : title;

  const button = (
    <button
      type="button"
      onClick={() => onApply(title)}
      disabled={disabled}
      className={[
        "group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs cursor-pointer",
        "transition-[border-color,background-color,opacity] duration-150",
        isCurrent
          ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
          : isOther
            ? "border-white/[0.06] bg-transparent text-white/25 opacity-40 cursor-not-allowed"
            : "border-white/[0.08] bg-white/[0.03] text-white/65 hover:border-[var(--color-brand-500)]/20 hover:bg-[var(--color-brand-500)]/[0.05] hover:text-[var(--color-brand-300)]",
      ].join(" ")}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isCurrent ? (
          <Loader2 size={11} strokeWidth={2} className="animate-spin text-[var(--color-brand-400)]" />
        ) : (
          <span
            className={[
              "block h-[5px] w-[5px] rounded-full transition-colors duration-150",
              isOther ? "bg-white/15" : "bg-white/20 group-hover:bg-[var(--color-brand-400)]/60",
            ].join(" ")}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-[var(--font-body)] leading-snug">
        {displayTitle}
      </span>
    </button>
  );

  if (truncated) {
    return <Tooltip content={title} delay={300}>{button}</Tooltip>;
  }

  return button;
}

export function TitleSuggestionChips({ titles, onApply }: TitleSuggestionChipsProps) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (titles.length === 0) return null;

  const handleApply = (title: string) => {
    if (applying || done) return;
    setApplying(title);
    onApply(title);
    setApplied(title);
    timerRef.current = setTimeout(() => {
      setApplying(null);
      setDone(true);
    }, APPLIED_DISPLAY_MS);
  };

  if (done && applied) {
    return (
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-500)]/20">
          <Check size={9} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
        </span>
        <span className="text-[11px] text-white/40">
          Title applied:{" "}
          <span className="text-white/65">{applied}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2.5 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/25 select-none">
        Title options
      </p>
      <div className="flex flex-col gap-1">
        {titles.map((title) => (
          <TitleChip
            key={title}
            title={title}
            isCurrent={applying === title}
            isOther={applying !== null && applying !== title}
            disabled={!!applying || done}
            onApply={handleApply}
          />
        ))}
      </div>
    </div>
  );
}
