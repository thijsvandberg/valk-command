"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  GripHorizontal,
  AlertCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { WorkspaceUsage } from "@/hooks/useStoryWriter";
import type { RelatedStoryCandidateRow } from "@/db/schema";
import {
  ChatMessage,
  DraftCard,
  RelatedStoriesInline,
  QuickActionsPopover,
  formatDuration,
} from "@/components/story-writer/ChatMessageParts";

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
  onRetry?: (messageId: string) => Promise<boolean>;
  onClearFailed?: () => Promise<void>;
  onFindRelated?: () => void;
  onOpenRelatedPanel?: () => void;
  onStoryKeyClick?: (key: string) => void;
  relatedCandidates?: RelatedStoryCandidateRow[];
  onLinkCandidate?: (candidateId: string, isLinked: boolean) => Promise<void>;
  messageDraftMap: Record<string, string>;
  draftContentMap: Record<string, string>;
  onViewDraft?: (draftId: string) => void;
  onFocusDraft?: (draftId: string) => void;
  onOpenLogs?: (taskId: string) => void;
  onApplyTitle?: (title: string) => void;
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
  onRetry,
  onClearFailed,
  onFindRelated,
  onOpenRelatedPanel,
  onStoryKeyClick,
  relatedCandidates,
  onLinkCandidate,
  messageDraftMap,
  draftContentMap,
  onViewDraft,
  onFocusDraft,
  onOpenLogs,
  onApplyTitle,
  issueType = "story",
}: StoryWriterChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [dupWarning, setDupWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const { data: promptsData } = useSWR<{ prompts: QuickPromptsConfig }>(
    "/api/settings/quick-prompts",
    promptsFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const quickPrompts = promptsData?.prompts[issueType] ?? [];

  const [manualInputHeight, setManualInputHeight] = useState<number | null>(null);
  const resizeDragging = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const isStreaming = status === "streaming" || status === "sending";
  const isBusy = isStreaming || sending;

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const messageLogsTaskIds = messages.map((msg, idx) => {
    if (msg.role === "user") return msg.workspaceTaskId ?? null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].workspaceTaskId) {
        return messages[i].workspaceTaskId ?? null;
      }
    }
    return null;
  });

  const hasFailedMessages = messages.some((m) => m.status === "failed" || m.status === "pending");

  const unansweredIdx =
    !isStreaming &&
    status === "ready" &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user" &&
    messages[messages.length - 1].status !== "failed" &&
    messages[messages.length - 1].status !== "pending"
      ? messages.length - 1
      : -1;

  const lastRelatedMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content.includes("<related-stories>")) return i;
    }
    return -1;
  })();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, streamProgress]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!resizeDragging.current) return;
      const delta = resizeStartY.current - e.clientY;
      const newHeight = Math.max(28, Math.min(400, resizeStartH.current + delta));
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

    // Client-side dedup: block identical message sent within 10s
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg && lastUserMsg.content.trim() === trimmed) {
      const elapsed = Date.now() - new Date(lastUserMsg.timestamp).getTime();
      if (elapsed < 10_000) {
        setDupWarning(true);
        setTimeout(() => setDupWarning(false), 3000);
        return;
      }
    }

    setSending(true);
    setInputValue("");
    setManualInputHeight(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const success = await onSend(trimmed);
    if (!success) setInputValue(trimmed);
    setSending(false);
    textareaRef.current?.focus();
  }, [inputValue, sending, isStreaming, messages, onSend]);

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
    setTimeout(() => {
      const el = textareaRef.current;
      if (el && !manualInputHeight) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
      }
      el?.focus();
    }, 0);
  }, [manualInputHeight]);

  const handleDirectSend = useCallback(async (text: string, enableCodebase: boolean) => {
    if (isBusy || inputValue.trim()) return;
    // Client-side dedup: block identical message sent within 10s
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg && lastUserMsg.content.trim() === text.trim()) {
      const elapsed = Date.now() - new Date(lastUserMsg.timestamp).getTime();
      if (elapsed < 10_000) {
        setDupWarning(true);
        setTimeout(() => setDupWarning(false), 3000);
        return;
      }
    }
    onCodebaseResearchChange(enableCodebase);
    setSending(true);
    await onSend(text);
    setSending(false);
  }, [isBusy, inputValue, messages, onCodebaseResearchChange, onSend]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
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
                onFocusDraft={onFocusDraft}
                logsTaskId={messageLogsTaskIds[idx]}
                onOpenLogs={onOpenLogs}
                onStoryKeyClick={onStoryKeyClick}
                onApplyTitle={onApplyTitle}
              />
              {msg.role === "user" && msg.status === "failed" && (
                <div className="flex justify-end mt-1">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-500/[0.06] border border-red-500/10">
                    <AlertCircle size={11} className="shrink-0 text-red-400/60" strokeWidth={1.5} />
                    <span className="text-[10px] text-red-300/60">Message could not be sent.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={9} strokeWidth={2} />}
                      onClick={() => onRetry?.(msg.id)}
                      disabled={isBusy}
                      className="text-[10px] text-red-300/70 hover:text-red-200/90 cursor-pointer"
                    >
                      Tap to retry
                    </Button>
                  </div>
                </div>
              )}
              {msg.role === "user" && msg.status === "pending" && !isStreaming && status === "ready" && (
                <div className="flex justify-end mt-1">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <AlertCircle size={10} className="shrink-0 text-amber-500/40" strokeWidth={1.5} />
                    <span className="text-[10px] text-white/30">Not sent</span>
                  </div>
                </div>
              )}
              {idx === lastAssistantIdx && lastResponseDurationMs != null && (
                <div className="mt-1 pl-1">
                  <span className="text-[10px] text-white/25 select-none">
                    ✻ Responded in {formatDuration(lastResponseDurationMs)}
                  </span>
                </div>
              )}
              {idx === lastRelatedMsgIdx && relatedCandidates && relatedCandidates.length > 0 && onLinkCandidate && (
                <RelatedStoriesInline
                  candidates={relatedCandidates}
                  onLink={onLinkCandidate}
                  onOpenPanel={onOpenRelatedPanel}
                />
              )}
              {idx === unansweredIdx && (
                <div className="flex justify-end mt-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <AlertCircle size={11} className="shrink-0 text-amber-500/50" strokeWidth={1.5} />
                    <span className="text-[10px] text-white/35">No response received</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={9} strokeWidth={2} />}
                      onClick={() => onSend(msg.content)}
                      className="text-[10px] text-white/45 hover:text-white/70"
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

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

      {streamError && (
        <div className="border-t border-red-500/20 px-4 py-2">
          <span className="text-xs text-red-400">{streamError}</span>
        </div>
      )}

      {dupWarning && (
        <div className="border-t border-amber-500/20 px-4 py-2">
          <span className="text-xs text-amber-400">Duplicate message blocked</span>
        </div>
      )}

      {hasFailedMessages && !isStreaming && onClearFailed && (
        <div className="border-t border-white/[0.06] px-4 py-1.5">
          <button
            type="button"
            onClick={onClearFailed}
            className="text-[10px] text-white/35 hover:text-white/55 cursor-pointer"
          >
            Clear failed messages
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-white/[0.06]">
        <div className="px-3 pt-2.5 pb-1.5">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-white/35">
            Quick prompts
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {quickPrompts.map((s) => (
              <div key={s.id} className="group flex items-stretch rounded-md border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-white/[0.11] transition-colors duration-150">
                <button
                  type="button"
                  onClick={() => {
                    if (inputValue.trim()) return;
                    onCodebaseResearchChange(s.enableCodebase === true);
                    fillInput(s.text);
                  }}
                  disabled={isBusy}
                  className="px-2.5 py-1 text-[11px] font-medium text-white/50 cursor-pointer hover:text-white/80 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s.label}
                </button>
                <button
                  type="button"
                  onClick={() => handleDirectSend(s.text, s.enableCodebase === true)}
                  disabled={isBusy || !!inputValue.trim()}
                  className="flex items-center justify-center border-l border-white/[0.07] px-2 text-white/20 cursor-pointer hover:bg-[var(--color-brand-500)]/[0.12] hover:text-[var(--color-brand-400)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Submit immediately"
                >
                  <SendHorizontal size={9} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 pb-2.5 pt-1">
          <div className="flex flex-col rounded-xl border border-white/[0.10] bg-white/[0.03] focus-within:border-[var(--color-brand-500)]/30 transition-colors duration-150">
            <div
              onMouseDown={handleResizeMouseDown}
              className="flex h-3 cursor-row-resize items-center justify-center opacity-35 hover:opacity-80 transition-opacity duration-150"
            >
              <GripHorizontal size={12} className="text-white/40" />
            </div>
            <div ref={inputWrapperRef} style={manualInputHeight ? { height: manualInputHeight } : undefined} className={manualInputHeight ? "overflow-hidden" : undefined}>
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
                rows={1}
                className={`w-full resize-none bg-transparent px-3.5 pt-1 pb-1 font-[var(--font-body)] text-sm leading-[1.7] text-white/90 placeholder-white/40 focus:outline-none disabled:opacity-50 ${manualInputHeight ? "h-full" : ""}`}
              />
            </div>
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-2">
                <QuickActionsPopover
                  actions={QUICK_ACTIONS}
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
                  disabled={isBusy}
                />
                {usage && (usage.inputTokens > 0 || usage.outputTokens > 0) && (
                  <span className="text-[10px] text-white/40 tabular-nums">
                    {(usage.inputTokens / 1000).toFixed(1)}k&nbsp;in&nbsp;·&nbsp;{(usage.outputTokens / 1000).toFixed(1)}k&nbsp;out
                    {usage.cost > 0 && <>&nbsp;·&nbsp;${usage.cost.toFixed(4)}</>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    const current = MODEL_OPTIONS.findIndex((o) => o.value === model);
                    const next = (current + 1) % MODEL_OPTIONS.length;
                    onModelChange(MODEL_OPTIONS[next].value);
                  }}
                  disabled={isBusy}
                  className="border-white/[0.10] bg-white/[0.04] font-mono text-[10px] tracking-[0.04em] text-white/55 hover:text-white/75 hover:border-white/[0.15] hover:bg-white/[0.07]"
                  title="Switch model"
                >
                  {MODEL_OPTIONS.find((o) => o.value === model)?.label ?? "Sonnet"}
                </Button>
                <Button
                  variant={codebaseResearch ? "soft" : "ghost"}
                  size="md"
                  icon={<Code2 size={11} strokeWidth={1.5} />}
                  onClick={() => onCodebaseResearchChange(!codebaseResearch)}
                  disabled={isBusy}
                  title={codebaseResearch ? "Codebase research on" : "Codebase research off"}
                  className={`text-[10px] ${
                    codebaseResearch
                      ? ""
                      : "border-white/[0.10] bg-white/[0.04] text-white/40 hover:text-white/65 hover:border-white/[0.15] hover:bg-white/[0.07]"
                  }`}
                >
                  Codebase
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  iconOnly
                  icon={
                    isBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                    ) : (
                      <SendHorizontal className="h-3 w-3" strokeWidth={2} />
                    )
                  }
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isBusy}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
