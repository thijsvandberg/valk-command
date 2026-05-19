"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";

interface TypeSuggestionChipProps {
  type: string;
  onApply: (type: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

export function TypeSuggestionChip({ type, onApply }: TypeSuggestionChipProps) {
  const [applied, setApplied] = useState(false);

  const label = TYPE_LABELS[type] ?? type;

  const handleApply = () => {
    setApplied(true);
    onApply(type);
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-1.5">
        <ArrowRight size={11} strokeWidth={1.5} className="text-text-muted shrink-0" />
        <span className="text-xs text-text-secondary">Change type to</span>
        <span className="flex items-center gap-1.5">
          <IssueTypeIcon type={type} size={13} />
          <span className="text-xs font-medium text-text-primary">{label}</span>
        </span>
        {applied ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 ml-1">
            <Check size={11} strokeWidth={2.5} />
            Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            className="ml-1 rounded-md px-2.5 py-0.5 text-xs font-medium text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10 cursor-pointer hover:bg-[var(--color-brand-500)]/20 active:bg-[var(--color-brand-500)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
          >
            Accept
          </button>
        )}
      </div>
    </div>
  );
}
