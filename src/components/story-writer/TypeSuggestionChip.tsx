"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";

interface TypeSuggestionChipProps {
  type: string;
  onApply: (type: string) => void;
  currentType?: string;
}

const TYPE_LABELS: Record<string, string> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

export function TypeSuggestionChip({ type, onApply, currentType }: TypeSuggestionChipProps) {
  const [clicked, setClicked] = useState(false);

  const applied = clicked || currentType === type;
  const label = TYPE_LABELS[type] ?? type;

  const handleApply = () => {
    setClicked(true);
    onApply(type);
  };

  return (
    <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default">
        <ArrowRight size={10} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Type change
        </span>
      </div>
      <div
        className={`flex items-center gap-2.5 px-3 py-2 transition-colors duration-150 ${
          applied
            ? "bg-[var(--color-brand-500)]/[0.04]"
            : "hover:bg-overlay-subtle"
        }`}
      >
        <span className="text-body-sm text-text-secondary">Change type to</span>
        <span className="flex items-center gap-1.5">
          <IssueTypeIcon type={type} size={13} />
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
        </span>
        <span className="flex-1" />
        {applied ? (
          <span className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
            Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150"
          >
            Accept
          </button>
        )}
      </div>
    </div>
  );
}
