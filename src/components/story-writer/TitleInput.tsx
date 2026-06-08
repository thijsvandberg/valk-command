"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

interface TitleInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When provided, a button appears on hover/focus that fires the title
  // suggestion prompt in one click. Disabled while the chat is already busy.
  onSuggest?: () => void | Promise<unknown>;
  suggestDisabled?: boolean;
}

export function TitleInput({
  value,
  onChange,
  placeholder = "Story title (optional, AI will suggest)",
  onSuggest,
  suggestDisabled = false,
}: TitleInputProps) {
  const [suggesting, setSuggesting] = useState(false);

  const handleSuggest = async () => {
    if (!onSuggest || suggesting || suggestDisabled) return;
    setSuggesting(true);
    try {
      await onSuggest();
    } finally {
      setSuggesting(false);
    }
  };

  // Padding lives on the wrapper (not the input) so the button can be vertically
  // centered against the title text via `items-center`. Centering on the input
  // itself would land too high because of its asymmetric pt-4/pb-1 padding.
  return (
    <div className={`group/title flex items-center pl-4 pt-4 pb-1 ${onSuggest ? "pr-3" : "pr-4"}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent font-[var(--font-display)] text-[1.35rem] font-semibold leading-snug tracking-tight text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      {onSuggest && (
        <Tooltip content="Suggest titles" delay={250} className="ml-2 shrink-0">
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting || suggestDisabled}
            aria-label="Suggest titles"
            className="flex size-7 items-center justify-center rounded-md border border-border-default bg-surface-elevated text-text-tertiary opacity-0 transition-opacity duration-150 cursor-pointer hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-brand-500)]/[0.06] hover:text-[var(--color-brand-500)] focus-visible:opacity-100 group-hover/title:opacity-100 disabled:cursor-default disabled:opacity-50"
          >
            {suggesting ? (
              <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Sparkles size={13} strokeWidth={1.5} />
            )}
          </button>
        </Tooltip>
      )}
    </div>
  );
}
