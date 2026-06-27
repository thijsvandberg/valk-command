"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Loader2, SendHorizontal, Square, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ChatInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  /** Slot rendered above the input container (e.g. quick prompt chips, mode toggles) */
  headerSlot?: ReactNode;
  /** Slot rendered in the footer bar, left side (e.g. quick actions, usage stats) */
  footerLeftSlot?: ReactNode;
  /** Slot rendered in the footer bar, right side before send button (e.g. model switcher) */
  footerRightSlot?: ReactNode;
  /** Enable drag-to-resize on the textarea */
  resizable?: boolean;
  /**
   * Compact, controls-free layout: the send button floats inside the input
   * rather than sitting in a separate footer row. Use when there are no footer
   * slots (model switcher, toggles), so the input stays tight instead of
   * showing an empty footer void.
   */
  compact?: boolean;
  /** aria-label for the textarea */
  ariaLabel?: string;
  /** aria-label for the send button */
  sendAriaLabel?: string;
  /** data-testid for the root element */
  testId?: string;
  /** Class applied to the header and input rows to constrain/center their content (e.g. "mx-auto w-full max-w-3xl") */
  contentClassName?: string;
  /** Called when the user clicks the cancel/stop button while streaming */
  onCancel?: () => void;
  /** Programmatically fill the input from outside */
  pendingInput?: string | null;
  onPendingInputConsumed?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = "Send a message...",
  headerSlot,
  footerLeftSlot,
  footerRightSlot,
  onCancel,
  resizable,
  compact,
  ariaLabel = "Message input",
  sendAriaLabel = "Send message",
  testId = "chat-input",
  pendingInput,
  onPendingInputConsumed,
  contentClassName,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Manual resize state
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const resizeDragging = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const isBusy = sending || disabled;

  // Consume pending input from parent
  useEffect(() => {
    if (pendingInput && !isBusy) {
      setValue(pendingInput); // eslint-disable-line react-hooks/set-state-in-effect -- consume pending input on arrival
      onPendingInputConsumed?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [pendingInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize drag handlers
  useEffect(() => {
    if (!resizable) return;

    function handleMouseMove(e: MouseEvent) {
      if (!resizeDragging.current) return;
      const delta = resizeStartY.current - e.clientY;
      const newHeight = Math.max(28, Math.min(400, resizeStartH.current + delta));
      setManualHeight(newHeight);
    }

    function handleMouseUp() {
      if (!resizeDragging.current) return;
      resizeDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizable]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragging.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = inputWrapperRef.current?.offsetHeight ?? 100;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;

    setSending(true);
    setValue("");
    setManualHeight(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const success = await onSend(trimmed);
    if (!success) setValue(trimmed);
    setSending(false);
    textareaRef.current?.focus();
  }, [value, isBusy, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (!manualHeight) {
      e.target.style.height = "auto";
      e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`;
    }
  };

  const sendButton =
    onCancel && disabled ? (
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon={<Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />}
        onClick={onCancel}
        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
        aria-label="Stop generating"
        data-testid="cancel-button"
      />
    ) : (
      <Button
        variant="primary"
        size="md"
        iconOnly
        icon={
          sending ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          ) : (
            <SendHorizontal className="h-3 w-3" strokeWidth={2} />
          )
        }
        onClick={handleSubmit}
        disabled={!value.trim() || isBusy}
        aria-label={sendAriaLabel}
      />
    );

  if (compact) {
    return (
      <div className="shrink-0 border-t border-border-default" data-testid={testId}>
        {headerSlot && (
          <div className={`px-3 pt-2.5 pb-1.5 ${contentClassName ?? ""}`}>
            {headerSlot}
          </div>
        )}

        <div className={`px-3 pb-3 pt-2.5 ${contentClassName ?? ""}`}>
          <div className="relative flex rounded-2xl border border-border-strong bg-[var(--color-surface-elevated)] focus-within:border-[var(--color-brand-500)]/40 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_8%,transparent)] transition-[border-color,box-shadow] duration-150">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isBusy}
              rows={1}
              className="w-full resize-none bg-transparent py-2.5 pl-3.5 pr-12 font-[var(--font-body)] text-body-lg leading-body text-text-primary placeholder-text-tertiary focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-500)]/50 disabled:opacity-50"
              aria-label={ariaLabel}
            />
            <div className="absolute bottom-1.5 right-1.5">{sendButton}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border-default" data-testid={testId}>
      {headerSlot && (
        <div className={`px-3 pt-2.5 pb-1.5 ${contentClassName ?? ""}`}>
          {headerSlot}
        </div>
      )}

      <div className={`px-3 pb-2.5 pt-1 ${contentClassName ?? ""}`}>
        <div className="flex flex-col rounded-2xl border border-border-strong bg-[var(--color-surface-elevated)] focus-within:border-[var(--color-brand-500)]/30 transition-colors duration-150">
          {resizable && (
            <div
              onMouseDown={handleResizeMouseDown}
              className="flex h-2.5 cursor-row-resize items-center justify-center opacity-0 hover:opacity-50 transition-opacity duration-150"
            >
              <div className="h-0.5 w-8 rounded-full bg-text-tertiary" />
            </div>
          )}

          <div
            ref={inputWrapperRef}
            style={manualHeight ? { height: manualHeight } : undefined}
            className={manualHeight ? "overflow-hidden" : undefined}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isBusy}
              rows={1}
              className={`w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 font-[var(--font-body)] text-body-lg leading-prose text-text-primary placeholder-text-tertiary focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-500)]/50 disabled:opacity-50 ${manualHeight ? "h-full" : ""}`}
              aria-label={ariaLabel}
            />
          </div>

          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            <div className="flex items-center gap-2">
              {footerLeftSlot}
            </div>
            <div className="flex items-center gap-1.5">
              {footerRightSlot}
              {sendButton}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Imperative handle to fill the ChatInput value from outside.
 * Useful for quick prompts that fill-but-don't-send.
 */
export function useChatInputFill() {
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const consume = useCallback(() => setPendingInput(null), []);

  return {
    pendingInput,
    fillInput: setPendingInput,
    onPendingInputConsumed: consume,
  };
}
