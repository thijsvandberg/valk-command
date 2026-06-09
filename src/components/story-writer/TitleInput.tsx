"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea to fit its content so long titles wrap onto
  // multiple lines instead of being clipped on a single line.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleSuggest = async () => {
    if (!onSuggest || suggesting || suggestDisabled) return;
    setSuggesting(true);
    try {
      await onSuggest();
    } finally {
      setSuggesting(false);
    }
  };

  // Padding lives on the wrapper (not the textarea) so the button aligns to the
  // first line of the title via `items-start`, which keeps it stable as the
  // title wraps onto multiple lines.
  return (
    <div className={`group/title flex items-start pl-4 pt-4 pb-1 ${onSuggest ? "pr-3" : "pr-4"}`}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // A title is a single logical line; block Enter from inserting newlines.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent font-[var(--font-display)] text-[1.35rem] font-semibold leading-snug tracking-tight text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      {onSuggest && (
        <Tooltip content="Suggest titles" delay={250} className="ml-2 mt-1 shrink-0">
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
