"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, SendHorizontal, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface InvestigationConfig {
  explainMode: boolean;
  jiraKey: string | null;
}

interface InvestigationInputProps {
  onSend: (content: string) => Promise<boolean>;
  onConfigChange: (config: InvestigationConfig) => void;
  disabled?: boolean;
}

export default function InvestigationInput({
  onSend,
  onConfigChange,
  disabled,
}: InvestigationInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [explainMode, setExplainMode] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onConfigChange({
      explainMode,
      jiraKey: jiraKey.trim() || null,
    });
  }, [explainMode, jiraKey, onConfigChange]);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    const success = await onSend(trimmed);
    if (!success) {
      setValue(trimmed);
    }
    setSending(false);
    textareaRef.current?.focus();
  }, [value, sending, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-white/[0.06] px-6 py-4" data-testid="investigation-input">
      <div className="mx-auto max-w-3xl space-y-3">
        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Tech / Explain toggle */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] p-0.5">
            <button
              type="button"
              onClick={() => setExplainMode(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium font-[var(--font-body)] cursor-pointer transition-all duration-150 ${
                !explainMode
                  ? "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-400)] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              Tech
            </button>
            <button
              type="button"
              onClick={() => setExplainMode(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium font-[var(--font-body)] cursor-pointer transition-all duration-150 ${
                explainMode
                  ? "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-400)] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              Explain
            </button>
          </div>

          {/* Jira key input */}
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-2.5 py-1">
            <Tag size={12} strokeWidth={1.5} className="text-white/30 shrink-0" />
            <input
              type="text"
              value={jiraKey}
              onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
              placeholder="VPL-XXXX"
              className="w-[80px] bg-transparent text-xs font-mono text-white/70 placeholder-white/25 outline-none"
              aria-label="Jira ticket key"
            />
          </div>
        </div>

        {/* Input row */}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the codebase..."
            disabled={disabled || sending}
            rows={1}
            className="flex-1 resize-none rounded-xl bg-[var(--color-surface-floating)] px-4 py-3 font-[var(--font-body)] text-sm leading-[1.7] text-white/90 placeholder-white/30 border border-white/[0.06] focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 disabled:opacity-50"
            aria-label="Investigation question"
          />
          <Button
            variant="primary"
            size="lg"
            iconOnly
            onClick={handleSubmit}
            disabled={!value.trim() || sending || disabled}
            className="shrink-0 rounded-xl h-10 w-10"
            aria-label="Send investigation"
            icon={
              sending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <SendHorizontal className="h-4 w-4" strokeWidth={2} />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
