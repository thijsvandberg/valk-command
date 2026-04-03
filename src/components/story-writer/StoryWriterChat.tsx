"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import {
  Loader2,
  SendHorizontal,
  FileText,
  Star,
  Search,
  Target,
  Code2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState, useCallback } from "react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";

interface StoryWriterChatProps {
  messages: Message[];
  status: StoryWriterStatus;
  streamProgress: string;
  streamError: string | null;
  codebaseResearch: boolean;
  onCodebaseResearchChange: (v: boolean) => void;
  model: string;
  onModelChange: (m: string) => void;
  onSend: (content: string) => Promise<boolean>;
  /** Map messageId -> draftId for messages that produced an AI draft */
  messageDraftMap: Record<string, string>;
  /** Opens the AI draft in plain view */
  onViewDraft?: (draftId: string) => void;
}

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Sonnet" },
  { value: "claude-opus-4-6", label: "Opus" },
] as const;

const QUICK_ACTIONS: {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: string;
  enabled: boolean;
}[] = [
  {
    id: "review",
    label: "Review Story",
    icon: Star,
    prompt:
      "Review this story. Score its quality and provide specific feedback on completeness, clarity, acceptance criteria, and testability.",
    enabled: true,
  },
  {
    id: "find-related",
    label: "Find Related",
    icon: Search,
    prompt: "",
    enabled: false,
  },
  {
    id: "match-epic",
    label: "Match Epic",
    icon: Target,
    prompt: "",
    enabled: false,
  },
  {
    id: "tech-analysis",
    label: "Technical Analysis",
    icon: Code2,
    prompt: "",
    enabled: false,
  },
];

const SUGGESTIONS: {
  label: string;
  text: string;
  enableCodebase?: boolean;
}[] = [
  { label: "Add test scenarios", text: "Add test scenarios" },
  { label: "Find related stories", text: "Find related stories in the backlog that overlap with or relate to this story" },
  { label: "Technical analysis", text: "Do a technical analysis of this story. Identify affected code areas, dependencies, and potential risks.", enableCodebase: true },
];

function ChatMessage({
  message,
  draftId,
  onViewDraft,
}: {
  message: Message;
  draftId?: string;
  onViewDraft?: (draftId: string) => void;
}) {
  const isUser = message.role === "user";

  const displayContent = message.content
    .replace(/<story-draft>[\s\S]*?<\/story-draft>/g, "")
    .replace(/\[codebase-research:\s*(?:on|off)\]\s*/g, "")
    .trim();

  const draftOnly = !displayContent && !!draftId;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-xl text-sm leading-[1.75] ${
          draftOnly
            ? ""
            : isUser
              ? "px-4 py-3 bg-[var(--color-brand-600)]/15 text-white/90 border border-[var(--color-brand-500)]/15"
              : "px-4 py-3 bg-white/[0.05] text-white/85 border border-white/[0.07]"
        }`}
      >
        {displayContent && (
          <div className="description-content chat-markdown">{renderMarkdown(displayContent)}</div>
        )}
        {draftId && (
          <button
            type="button"
            onClick={() => onViewDraft?.(draftId)}
            className={`${displayContent ? "mt-2.5" : ""} flex items-center gap-1.5 rounded-md bg-[var(--color-brand-500)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-500)]/20 active:scale-[0.98] transition-transform duration-150`}
          >
            <FileText size={12} strokeWidth={1.5} />
            Draft updated
          </button>
        )}
      </div>
    </div>
  );
}

function QuickActionsPopover({
  onSelect,
  open,
  onToggle,
  onClose,
  disabled,
}: {
  onSelect: (prompt: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border cursor-pointer transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
          open
            ? "bg-white/[0.08] border-white/[0.12] text-white/70"
            : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:bg-white/[0.06]"
        }`}
        title="AI actions"
      >
        <Zap size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-lg border border-white/[0.10] bg-[var(--color-surface-floating)] py-1 shadow-xl shadow-black/30">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => action.enabled && onSelect(action.prompt)}
                disabled={!action.enabled}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                  action.enabled
                    ? "text-white/70 hover:bg-white/[0.06] hover:text-white/90"
                    : "text-white/25 cursor-not-allowed"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} className="shrink-0" />
                <span>{action.label}</span>
                {!action.enabled && (
                  <span className="ml-auto text-[10px] text-white/15">soon</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StoryWriterChat({
  messages,
  status,
  streamProgress,
  streamError,
  codebaseResearch,
  onCodebaseResearchChange,
  model,
  onModelChange,
  onSend,
  messageDraftMap,
  onViewDraft,
}: StoryWriterChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = status === "streaming" || status === "sending";

  // Auto-scroll on new messages or progress
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, streamProgress]);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending || isStreaming) return;
    setSending(true);
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const success = await onSend(trimmed);
    if (!success) setInputValue(trimmed);
    setSending(false);
    textareaRef.current?.focus();
  }, [inputValue, sending, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const fillInput = useCallback((text: string) => {
    setInputValue(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.length === 0 && status === "ready" && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.06]">
                <FileText size={18} className="text-white/20" strokeWidth={1.5} />
              </div>
              <p className="text-xs text-white/25 text-center max-w-[200px]">
                Start a conversation to improve this story
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              draftId={messageDraftMap[msg.id]}
              onViewDraft={onViewDraft}
            />
          ))}
        </div>
      </div>

      {/* Stream progress */}
      {isStreaming && streamProgress && (
        <div className="border-t border-white/[0.06] px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
            <span className="text-xs text-white/40 truncate">
              {streamProgress.slice(0, 80)}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {streamError && (
        <div className="border-t border-red-500/20 px-4 py-2">
          <span className="text-xs text-red-400">{streamError}</span>
        </div>
      )}

      {/* Footer: presets + input */}
      <div className="border-t border-white/[0.06]">
        {/* Presets row */}
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2.5 pb-1.5">
          {/* Improve my story: compound chip with codebase toggle */}
          <div className={`flex items-center rounded-md overflow-hidden border transition-colors duration-150 ${
            codebaseResearch
              ? "border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06]"
              : "border-white/[0.06] bg-white/[0.02]"
          }`}>
            <button
              type="button"
              onClick={() => fillInput("Improve my story")}
              disabled={isStreaming || sending}
              className="px-3 py-1.5 text-xs text-white/50 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 active:scale-[0.97] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Improve my story
            </button>
            <div className="w-px h-3.5 bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => onCodebaseResearchChange(!codebaseResearch)}
              disabled={isStreaming || sending}
              title={codebaseResearch ? "Codebase research on" : "Codebase research off"}
              className={`flex items-center px-2 py-1.5 cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                codebaseResearch
                  ? "text-[var(--color-brand-400)]"
                  : "text-white/20 hover:text-white/45"
              }`}
            >
              <Code2 size={11} strokeWidth={1.5} />
            </button>
          </div>

          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (s.enableCodebase) onCodebaseResearchChange(true);
                fillInput(s.text);
              }}
              disabled={isStreaming || sending}
              className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-white/50 cursor-pointer hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.10] active:scale-[0.97] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-3 pb-2.5 pt-1">
          <div className="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.025] focus-within:border-[var(--color-brand-500)]/25 transition-colors duration-150">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Describe what to improve..."
              disabled={isStreaming || sending}
              rows={3}
              className="flex-1 resize-none bg-transparent px-3.5 pt-3 pb-1 font-[var(--font-body)] text-sm leading-[1.7] text-white/90 placeholder-white/30 focus:outline-none disabled:opacity-50"
            />
            {/* Bottom toolbar inside input */}
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <QuickActionsPopover
                onSelect={(prompt) => { fillInput(prompt); setShowActions(false); }}
                open={showActions}
                onToggle={() => setShowActions((v) => !v)}
                onClose={() => setShowActions(false)}
                disabled={isStreaming || sending}
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const current = MODEL_OPTIONS.findIndex((o) => o.value === model);
                    const next = (current + 1) % MODEL_OPTIONS.length;
                    onModelChange(MODEL_OPTIONS[next].value);
                  }}
                  disabled={isStreaming || sending}
                  className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 font-mono text-[10px] tracking-[0.04em] text-white/30 cursor-pointer hover:text-white/50 hover:border-white/[0.10] hover:bg-white/[0.05] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Switch model"
                >
                  {MODEL_OPTIONS.find((o) => o.value === model)?.label ?? "Sonnet"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || sending || isStreaming}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white shadow-[0_1px_4px_rgba(46,145,73,0.15)] cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-transform duration-150 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-brand-600)]"
                >
                  {sending || isStreaming ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <SendHorizontal className="h-3 w-3" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
