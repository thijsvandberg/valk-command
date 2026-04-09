"use client";

import { useState, useRef, useCallback } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    [handleSubmit]
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-white/[0.06] px-6 py-4" data-testid="message-input">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={disabled || sending}
          rows={1}
          className="flex-1 resize-none rounded-xl bg-[var(--color-surface-floating)] px-4 py-3 font-[var(--font-body)] text-sm leading-[1.7] text-white/90 placeholder-white/30 border border-white/[0.06] focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 disabled:opacity-50"
          aria-label="Message input"
        />
        <Button
          variant="primary"
          size="lg"
          iconOnly
          onClick={handleSubmit}
          disabled={!value.trim() || sending || disabled}
          className="shrink-0 rounded-xl h-10 w-10"
          aria-label="Send message"
          icon={sending
            ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            : <SendHorizontal className="h-4 w-4" strokeWidth={2} />
          }
        />
      </div>
    </div>
  );
}
