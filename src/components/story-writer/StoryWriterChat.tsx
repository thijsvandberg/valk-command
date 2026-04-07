"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import type { IssueType } from "@/types/ticket";
import type { QuickPromptsConfig } from "@/app/api/settings/quick-prompts/route";
import {
  Loader2,
  SendHorizontal,
  FileText,
  Star,
  Search,
  Target,
  Code2,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  GripHorizontal,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { useState, useCallback } from "react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import type { WorkspaceUsage } from "@/hooks/useStoryWriter";
import type { RelatedStoryCandidateRow } from "@/db/schema";

interface StoryWriterChatProps {
  messages: Message[];
  status: StoryWriterStatus;
  streamProgress: string;
  streamError: string | null;
  usage: WorkspaceUsage | null;
  lastResponseDurationMs: number | null;
  localDraft: string | null;
  codebaseResearch: boolean;
  onCodebaseResearchChange: (v: boolean) => void;
  model: string;
  onModelChange: (m: string) => void;
  onSend: (content: string, skill?: string) => Promise<boolean>;
  onFindRelated?: () => void;
  onOpenRelatedPanel?: () => void;
  onStoryKeyClick?: (key: string) => void;
  relatedCandidates?: RelatedStoryCandidateRow[];
  onLinkCandidate?: (candidateId: string, isLinked: boolean) => Promise<void>;
  messageDraftMap: Record<string, string>;
  draftContentMap: Record<string, string>;
  onViewDraft?: (draftId: string) => void;
  issueType?: IssueType;
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
    prompt: "Find related stories",
    enabled: true,
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

const promptsFetcher = (url: string) => fetch(url).then((r) => r.json());

const MESSAGE_COLLAPSE_HEIGHT = 200;

function RelatedStoriesInline({
  candidates,
  onLink,
  onOpenPanel,
}: {
  candidates: RelatedStoryCandidateRow[];
  onLink: (candidateId: string, isLinked: boolean) => Promise<void>;
  onOpenPanel?: () => void;
}) {
  const [linkingId, setLinkingId] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  const handleLink = async (id: string, isLinked: boolean) => {
    setLinkingId(id);
    await onLink(id, isLinked);
    setLinkingId(null);
  };

  const jiraBase = "https://new-story.atlassian.net/browse/";

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-brand-500)]/12 bg-[var(--color-brand-500)]/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/35">
          Related Stories
        </span>
        {onOpenPanel && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="text-[10px] text-white/30 hover:text-white/60 cursor-pointer transition-colors duration-150"
          >
            Open panel
          </button>
        )}
      </div>
      <div className="divide-y divide-white/[0.04]">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`shrink-0 text-[10px] font-bold tabular-nums w-6 text-right ${c.score >= 80 ? "text-emerald-400" : c.score >= 60 ? "text-amber-400" : "text-white/35"}`}>
              {c.score}
            </span>
            <a
              href={c.jiraUrl ?? `${jiraBase}${c.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] shrink-0 transition-colors duration-100"
            >
              {c.jiraKey}
            </a>
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/60">
              {c.title}
            </span>
            <button
              type="button"
              onClick={() => handleLink(c.id, !c.isLinked)}
              disabled={linkingId === c.id}
              className={`shrink-0 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors duration-150 disabled:opacity-50 ${
                c.isLinked
                  ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                  : "border-white/[0.10] text-white/35 hover:border-[var(--color-brand-500)]/20 hover:text-[var(--color-brand-400)]"
              }`}
            >
              {linkingId === c.id ? (
                <Loader2 size={9} className="animate-spin" />
              ) : (
                <Link2 size={9} strokeWidth={1.5} />
              )}
              {c.isLinked ? "Linked" : "Link"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (isToday) return `${hh}:${mm}`;
  const day = date.getDate();
  const month = date.toLocaleString("en", { month: "short" });
  return `${day} ${month} ${hh}:${mm}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainSeconds}s`;
}

function ChatMessage({
  message,
  draftId,
  draftContent,
  onViewDraft,
  isLastAssistant,
  lastResponseDurationMs,
  onStoryKeyClick,
}: {
  message: Message;
  draftId?: string;
  draftContent?: string;
  onViewDraft?: (draftId: string) => void;
  isLastAssistant?: boolean;
  lastResponseDurationMs?: number | null;
  onStoryKeyClick?: (key: string) => void;
}) {
  const isUser = message.role === "user";
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onStoryKeyClick) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    // Let CMD/CTRL+click open in new tab normally
    if (e.metaKey || e.ctrlKey) return;
    const href = anchor.getAttribute("href") ?? "";
    const match = href.match(/atlassian\.net\/browse\/([A-Z]+-\d+)/);
    if (!match) return;
    e.preventDefault();
    onStoryKeyClick(match[1]);
  }, [onStoryKeyClick]);

  const displayContent = message.content
    .replace(/<story-draft>[\s\S]*?<\/story-draft>/g, "")
    .replace(/<related-stories>[\s\S]*?<\/related-stories>/g, "")
    .replace(/\[codebase-research:\s*(?:on|off)\]\s*/g, "")
    .trim();

  const draftOnly = !displayContent && !!draftId;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > MESSAGE_COLLAPSE_HEIGHT);
  }, [displayContent]);

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
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
          <div>
            <div
              ref={contentRef}
              onClick={handleContentClick}
              className="description-content chat-markdown overflow-hidden transition-[max-height] duration-300 ease-out"
              style={!expanded && isOverflowing ? { maxHeight: MESSAGE_COLLAPSE_HEIGHT } : undefined}
            >
              {renderMarkdown(displayContent)}
            </div>
            {isOverflowing && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`flex items-center gap-1 text-[11px] cursor-pointer transition-colors duration-150 ${
                  expanded
                    ? "mt-1 text-white/35 hover:text-white/55"
                    : "-mt-1 pt-3 text-white/45 hover:text-white/65 border-t border-white/[0.06] w-full"
                }`}
              >
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {draftId && (
          <div className={`${displayContent ? "mt-2.5" : ""} rounded-lg border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.04]`}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDraftExpanded((v) => !v)}
                className="flex flex-1 items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/10 rounded-t-lg transition-colors duration-150"
              >
                <FileText size={12} strokeWidth={1.5} />
                Draft updated
                {draftExpanded ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
              </button>
              <button
                type="button"
                onClick={() => onViewDraft?.(draftId)}
                className="px-2.5 py-1.5 text-[10px] text-[var(--color-brand-400)]/60 cursor-pointer hover:text-[var(--color-brand-400)] transition-colors duration-150"
                title="Open in editor"
              >
                Open
              </button>
            </div>
            {draftExpanded && draftContent && (
              <div className="border-t border-[var(--color-brand-500)]/10 px-3 py-2.5 max-h-[300px] overflow-y-auto">
                <div className="description-content chat-markdown text-xs leading-[1.7] text-white/70">
                  {renderMarkdown(draftContent)}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Timestamp + duration footer */}
        <div className={`flex items-center gap-2 mt-1.5 ${displayContent || draftId ? "" : "hidden"}`}>
          <span className="text-[10px] text-white/0 group-hover:text-white/30 transition-colors duration-200 select-none tabular-nums">
            {formatTimestamp(message.timestamp)}
          </span>
          {isLastAssistant && lastResponseDurationMs != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-white/30 select-none tabular-nums">
              <Clock size={9} strokeWidth={1.5} />
              {formatDuration(lastResponseDurationMs)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > 120);
  }, [content]);

  if (!content) return null;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors duration-150"
      >
        <FileText size={12} strokeWidth={1.5} className="text-white/30 shrink-0" />
        <span className="text-[11px] font-medium text-white/45">Current draft</span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp size={12} className="text-white/25" />
          ) : (
            <ChevronDown size={12} className="text-white/25" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-2.5">
          <div className="relative">
            <div
              ref={contentRef}
              className={`description-content chat-markdown text-xs leading-[1.7] text-white/70 overflow-hidden ${
                !isOverflowing ? "" : ""
              }`}
              style={isOverflowing ? { maxHeight: "none" } : undefined}
            >
              {renderMarkdown(content)}
            </div>
          </div>
        </div>
      )}
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
  onSelect: (prompt: string, actionId: string) => void;
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
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border cursor-pointer transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
          open
            ? "bg-white/[0.10] border-white/[0.15] text-white/80"
            : "bg-white/[0.04] border-white/[0.10] text-white/55 hover:text-white/75 hover:bg-white/[0.08]"
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
                onClick={() => action.enabled && onSelect(action.prompt, action.id)}
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
  usage,
  lastResponseDurationMs,
  localDraft,
  codebaseResearch,
  onCodebaseResearchChange,
  model,
  onModelChange,
  onSend,
  onFindRelated,
  onOpenRelatedPanel,
  onStoryKeyClick,
  relatedCandidates,
  onLinkCandidate,
  messageDraftMap,
  draftContentMap,
  onViewDraft,
  issueType = "story",
}: StoryWriterChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const { data: promptsData } = useSWR<{ prompts: QuickPromptsConfig }>(
    "/api/settings/quick-prompts",
    promptsFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const quickPrompts = promptsData?.prompts[issueType] ?? [];

  // Manual resize state for textarea
  const [manualInputHeight, setManualInputHeight] = useState<number | null>(null);
  const resizeDragging = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const isStreaming = status === "streaming" || status === "sending";

  // Find the last assistant message index
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  // Find the last message that contained a <related-stories> block (anchors inline panel to that message)
  const lastRelatedMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content.includes("<related-stories>")) return i;
    }
    return -1;
  })();

  // Auto-scroll on new messages or progress
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, streamProgress]);

  // Manual resize handlers
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!resizeDragging.current) return;
      const delta = resizeStartY.current - e.clientY;
      const newHeight = Math.max(60, Math.min(400, resizeStartH.current + delta));
      setManualInputHeight(newHeight);
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
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragging.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = inputWrapperRef.current?.offsetHeight ?? 100;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending || isStreaming) return;
    setSending(true);
    setInputValue("");
    setManualInputHeight(null);
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {/* Draft card */}
          {localDraft && <DraftCard content={localDraft} />}

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
          {messages.map((msg, idx) => (
            <div key={msg.id}>
              <ChatMessage
                message={msg}
                draftId={messageDraftMap[msg.id]}
                draftContent={messageDraftMap[msg.id] ? draftContentMap[messageDraftMap[msg.id]] : undefined}
                onViewDraft={onViewDraft}
                isLastAssistant={idx === lastAssistantIdx}
                lastResponseDurationMs={lastResponseDurationMs}
                onStoryKeyClick={onStoryKeyClick}
              />
              {/* Inline related stories anchored to the message that triggered find-related */}
              {idx === lastRelatedMsgIdx && relatedCandidates && relatedCandidates.length > 0 && onLinkCandidate && (
                <RelatedStoriesInline
                  candidates={relatedCandidates}
                  onLink={onLinkCandidate}
                  onOpenPanel={onOpenRelatedPanel}
                />
              )}
            </div>
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
      <div className="shrink-0 border-t border-white/[0.06]">
        {/* Presets row */}
        <div className="px-3 pt-2.5 pb-1.5">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-white/35">
            Quick prompts
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {quickPrompts.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onCodebaseResearchChange(s.enableCodebase === true);
                  fillInput(s.text);
                }}
                disabled={isStreaming || sending}
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 cursor-pointer hover:bg-white/[0.07] hover:text-white/85 hover:border-white/[0.12] active:scale-[0.97] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-3 pb-2.5 pt-1">
          <div className="flex flex-col rounded-xl border border-white/[0.10] bg-white/[0.03] focus-within:border-[var(--color-brand-500)]/30 transition-colors duration-150">
            {/* Resize handle at top */}
            <div
              onMouseDown={handleResizeMouseDown}
              className="flex h-3 cursor-row-resize items-center justify-center opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
            >
              <GripHorizontal size={12} className="text-white/25" />
            </div>
            <div ref={inputWrapperRef} style={manualInputHeight ? { height: manualInputHeight } : undefined}>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (!manualInputHeight) {
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`;
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Describe what to improve..."
                disabled={isStreaming || sending}
                rows={2}
                className="w-full resize-none bg-transparent px-3.5 pt-1 pb-1 font-[var(--font-body)] text-sm leading-[1.7] text-white/90 placeholder-white/40 focus:outline-none disabled:opacity-50"
              />
            </div>
            {/* Bottom toolbar inside input */}
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-2">
                <QuickActionsPopover
                  onSelect={(prompt, actionId) => {
                    setShowActions(false);
                    if (actionId === "find-related") {
                      onFindRelated?.();
                    } else {
                      fillInput(prompt);
                    }
                  }}
                  open={showActions}
                  onToggle={() => setShowActions((v) => !v)}
                  onClose={() => setShowActions(false)}
                  disabled={isStreaming || sending}
                />
                {usage && (
                  <span className="text-[10px] text-white/40 tabular-nums">
                    {(usage.inputTokens / 1000).toFixed(1)}k&nbsp;in&nbsp;·&nbsp;{(usage.outputTokens / 1000).toFixed(1)}k&nbsp;out
                    {usage.cost > 0 && <>&nbsp;·&nbsp;${usage.cost.toFixed(4)}</>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const current = MODEL_OPTIONS.findIndex((o) => o.value === model);
                    const next = (current + 1) % MODEL_OPTIONS.length;
                    onModelChange(MODEL_OPTIONS[next].value);
                  }}
                  disabled={isStreaming || sending}
                  className="flex h-7 items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.04] px-2.5 font-mono text-[10px] tracking-[0.04em] text-white/55 cursor-pointer hover:text-white/75 hover:border-white/[0.15] hover:bg-white/[0.07] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Switch model"
                >
                  {MODEL_OPTIONS.find((o) => o.value === model)?.label ?? "Sonnet"}
                </button>
                <button
                  type="button"
                  onClick={() => onCodebaseResearchChange(!codebaseResearch)}
                  disabled={isStreaming || sending}
                  title={codebaseResearch ? "Codebase research on" : "Codebase research off"}
                  className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[10px] cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                    codebaseResearch
                      ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                      : "border-white/[0.10] bg-white/[0.04] text-white/40 hover:text-white/65 hover:border-white/[0.15] hover:bg-white/[0.07]"
                  }`}
                >
                  <Code2 size={11} strokeWidth={1.5} />
                  Codebase
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
