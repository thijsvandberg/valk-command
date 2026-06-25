"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import type { IssueType } from "@/types/ticket";
import type { QuickPrompt, QuickPromptsConfig } from "@/app/api/settings/quick-prompts/route";
import {
  Loader2,
  SendHorizontal,
  Square,
  Star,
  Search,
  Zap,
  Code2,
  Sparkles,
  ListChecks,
  PenLine,
  AlertCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { WorkspaceUsage } from "@/hooks/useStoryWriter";
import type { RelatedStoryCandidate } from "@/types/story-writer";
import {
  ChatMessage,
  DraftCard,
  RelatedStoriesInline,
  formatDuration,
} from "@/components/story-writer/ChatMessageParts";
import { ModelSelector, CodebaseToggle, QuickActionsPopover, type QuickAction } from "@/components/shared/chat-controls";
import { StreamingIndicator } from "@/components/shared/StreamingIndicator";

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
  onCancel?: () => void;
  onFindRelated?: () => void;
  onOpenRelatedPanel?: () => void;
  onStoryKeyClick?: (key: string) => void;
  relatedCandidates?: RelatedStoryCandidate[];
  onLinkCandidate?: (candidateId: string, isLinked: boolean) => Promise<void>;
  messageDraftMap: Record<string, string>;
  draftContentMap: Record<string, string>;
  onViewDraft?: (draftId: string) => void;
  onFocusDraft?: (draftId: string) => void;
  onAcceptDraft?: (draftId: string) => void;
  onShowDiff?: (draftId: string) => void;
  onOpenLogs?: (taskId: string) => void;
  onApplyTitle?: (title: string) => void;
  onApplyType?: (type: string) => void;
  onCreateLink?: (targetKey: string, relation: string) => Promise<void>;
  linkedIssueKeys?: Set<string>;
  onApplyEpic?: (epicKey: string) => Promise<void>;
  currentEpicKey?: string | null;
  issueType?: IssueType;
  currentTitle?: string;
  currentType?: string;
  pendingInput?: string | null;
  onPendingInputConsumed?: () => void;
}

/**
 * Relational actions that aren't part of the editable per-type prompt list.
 * Always available in the dropdown regardless of story state, so they can be
 * found even when their context-filtered inline chip is hidden.
 */
const SPECIAL_ACTIONS: QuickAction[] = [
  {
    id: "find-related",
    label: "Find Related",
    icon: Search,
    prompt: "Find related stories",
    enabled: true,
    // Opens the related-stories panel instead of sending a message, so the
    // inline "send now" affordance does not apply here.
    sendable: false,
  },
  {
    id: "review",
    label: "Review Story",
    icon: Star,
    prompt:
      "Review this story. Score its quality and provide specific feedback on completeness, clarity, acceptance criteria, and testability.",
    enabled: true,
  },
  {
    id: "match-epic",
    label: "Match Epic",
    icon: Zap,
    prompt: "Suggest the best epic for this story",
    enabled: true,
  },
];

/** Pick an icon for an editable quick prompt based on its intent. */
function iconForPrompt(p: QuickPrompt): LucideIcon {
  const label = p.label.toLowerCase();
  if (p.enableCodebase || label.includes("technical") || label.includes("root cause")) return Code2;
  if (label.includes("test")) return ListChecks;
  if (label.includes("title")) return PenLine;
  return Sparkles;
}

export type ChipContext = {
  hasTitle: boolean;
  hasDraft: boolean;
  hasRelated: boolean;
  hasLinkedIssues: boolean;
};

type ContextualPrompt = QuickPrompt & {
  visible: (ctx: ChipContext) => boolean;
  order: number;
  /** Whether the chip sits before ("lead") or after ("trail") the API prompts */
  placement: "lead" | "trail";
  /** When set, the chip triggers this action ID instead of sending text */
  actionId?: string;
};

const CONTEXTUAL_PROMPTS: ContextualPrompt[] = [
  {
    id: "ctx-find-related",
    label: "Find related",
    text: "Find related stories",
    order: 0,
    placement: "lead",
    actionId: "find-related",
    visible: ({ hasTitle, hasRelated, hasLinkedIssues }) =>
      hasTitle && !hasRelated && !hasLinkedIssues,
  },
  {
    id: "ctx-review-story",
    label: "Review story",
    text: "Review this story. Score its quality and provide specific feedback on completeness, clarity, acceptance criteria, and testability.",
    order: 1,
    // Trails the editable prompts so it is the first chip dropped once the cap is hit
    placement: "trail",
    visible: ({ hasDraft }) => hasDraft,
  },
];

/** Maximum number of chips rendered; trailing chips are dropped first. */
export const MAX_VISIBLE_CHIPS = 5;

/** Pure helper: merge API prompts with contextual prompts based on story state */
export function getVisibleChips(
  apiPrompts: QuickPrompt[],
  ctx: ChipContext
): QuickPrompt[] {
  const filtered = apiPrompts.filter((p) => {
    if (ctx.hasTitle && p.label.toLowerCase() === "suggest title") {
      return false;
    }
    return true;
  });

  const stripInternal = ({
    visible: _v,
    order: _o,
    placement: _p,
    actionId: _a,
    ...rest
  }: ContextualPrompt): QuickPrompt => rest;

  const visible = CONTEXTUAL_PROMPTS.filter((cp) => cp.visible(ctx)).sort(
    (a, b) => a.order - b.order
  );
  const lead = visible.filter((cp) => cp.placement === "lead").map(stripInternal);
  const trail = visible.filter((cp) => cp.placement === "trail").map(stripInternal);

  return [...lead, ...filtered, ...trail].slice(0, MAX_VISIBLE_CHIPS);
}

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
  onCancel,
  onFindRelated,
  onOpenRelatedPanel,
  onStoryKeyClick,
  relatedCandidates,
  onLinkCandidate,
  messageDraftMap,
  draftContentMap,
  onViewDraft,
  onFocusDraft,
  onAcceptDraft,
  onShowDiff,
  onOpenLogs,
  onApplyTitle,
  onApplyType,
  onCreateLink,
  linkedIssueKeys,
  onApplyEpic,
  currentEpicKey,
  issueType = "story",
  currentTitle,
  currentType,
  pendingInput,
  onPendingInputConsumed,
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
  const apiPrompts = useMemo(() => promptsData?.prompts[issueType] ?? [], [promptsData?.prompts, issueType]);

  const hasTitle = !!(currentTitle && currentTitle !== "Untitled draft");
  const hasDraft = !!localDraft?.trim();
  const hasRelated = !!(relatedCandidates && relatedCandidates.length > 0);
  const hasLinkedIssues = !!(linkedIssueKeys && linkedIssueKeys.size > 0);

  const chipContext: ChipContext = useMemo(
    () => ({ hasTitle, hasDraft, hasRelated, hasLinkedIssues }),
    [hasTitle, hasDraft, hasRelated, hasLinkedIssues]
  );

  const mergedChips = useMemo(
    () => getVisibleChips(apiPrompts, chipContext),
    [apiPrompts, chipContext]
  );

  // Dropdown lists every quick suggestion unconditionally (relational actions +
  // all editable per-type prompts), so nothing is hidden by context filtering.
  const dropdownActions = useMemo(
    () => [
      ...SPECIAL_ACTIONS,
      ...apiPrompts.map((p) => ({
        id: p.id,
        label: p.label,
        icon: iconForPrompt(p),
        prompt: p.text,
        enabled: true,
      })),
    ],
    [apiPrompts]
  );

  const [manualInputHeight, setManualInputHeight] = useState<number | null>(null);
  const resizeDragging = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const isStreaming = status === "streaming" || status === "sending";
  const isBusy = isStreaming || sending;

  useEffect(() => {
    if (pendingInput && !isBusy) {
      setInputValue(pendingInput); // eslint-disable-line react-hooks/set-state-in-effect -- consume pending input on arrival
      onPendingInputConsumed?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [pendingInput]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The most recent message carrying a draft; only this one shows expanded by default.
  const latestDraftMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messageDraftMap[messages[i].id]) return messages[i].id;
    }
    return null;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {localDraft && <DraftCard content={localDraft} />}

          {messages.length === 0 && status === "ready" && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-brand-500)]/[0.08] border border-[var(--color-brand-500)]/[0.12]">
                <Sparkles size={18} className="text-[var(--color-brand-400)] opacity-60" strokeWidth={1.5} />
              </div>
              <p className="text-body-sm text-text-muted text-center max-w-[200px]">
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
                isLatestDraft={msg.id === latestDraftMessageId}
                onViewDraft={onViewDraft}
                onFocusDraft={onFocusDraft}
                onAcceptDraft={onAcceptDraft}
                onShowDiff={onShowDiff}
                hasExistingDraft={!!localDraft?.trim()}
                logsTaskId={messageLogsTaskIds[idx]}
                onOpenLogs={onOpenLogs}
                onStoryKeyClick={onStoryKeyClick}
                onApplyTitle={onApplyTitle}
                onApplyType={onApplyType}
                currentTitle={currentTitle}
                currentType={currentType}
                onCreateLink={onCreateLink}
                linkedIssueKeys={linkedIssueKeys}
                onApplyEpic={onApplyEpic}
                currentEpicKey={currentEpicKey}
              />
              {msg.role === "user" && msg.status === "failed" && (
                <div className="flex justify-end mt-1">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-500/[0.06] border border-red-500/10">
                    <AlertCircle size={11} className="shrink-0 text-red-400/60" strokeWidth={1.5} />
                    <span className="text-caption text-red-300/60">Message could not be sent.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={9} strokeWidth={2} />}
                      onClick={() => onRetry?.(msg.id)}
                      disabled={isBusy}
                      className="text-caption text-red-300/70 hover:text-red-200/90 cursor-pointer"
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
                    <span className="text-caption text-text-tertiary">Not sent</span>
                  </div>
                </div>
              )}
              {idx === lastAssistantIdx && lastResponseDurationMs != null && (
                <div className="mt-1.5 pl-[34px]">
                  <span className="text-caption text-text-muted select-none">
                    Responded in {formatDuration(lastResponseDurationMs)}
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
                    <span className="text-caption text-text-tertiary">No response received</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={9} strokeWidth={2} />}
                      onClick={() => onRetry?.(msg.id)}
                      disabled={!onRetry || isBusy}
                      className="text-caption text-text-tertiary hover:text-text-secondary"
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
        <div className="border-t border-border-default px-4 py-2.5">
          <StreamingIndicator text={streamProgress.slice(0, 80)} className="pl-[34px]" />
        </div>
      )}

      {streamError && (
        <div className="border-t border-red-500/20 px-4 py-2">
          <span className="text-body-sm text-red-400">{streamError}</span>
        </div>
      )}

      {dupWarning && (
        <div className="border-t border-amber-500/20 px-4 py-2">
          <span className="text-body-sm text-amber-400">Duplicate message blocked</span>
        </div>
      )}

      {hasFailedMessages && !isStreaming && onClearFailed && (
        <div className="border-t border-border-default px-4 py-1.5">
          <button
            type="button"
            onClick={onClearFailed}
            className="text-caption text-text-tertiary hover:text-text-secondary cursor-pointer"
          >
            Clear failed messages
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border-default">
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
            {mergedChips.map((s) => {
              const isCtxFindRelated = s.id === "ctx-find-related";
              return (
                <div
                  key={s.id}
                  className="group flex items-stretch rounded-lg border border-border-default bg-overlay-subtle overflow-hidden hover:border-[var(--color-brand-500)]/20 hover:bg-[var(--color-brand-500)]/[0.04] transition-colors duration-150"
                  style={{ animation: "chipFadeIn 200ms ease-out both" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (inputValue.trim()) return;
                      if (isCtxFindRelated) {
                        onFindRelated?.();
                        return;
                      }
                      onCodebaseResearchChange(s.enableCodebase === true);
                      fillInput(s.text);
                    }}
                    disabled={isBusy}
                    className="px-2.5 py-1.5 text-label font-medium text-text-secondary cursor-pointer hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isCtxFindRelated) {
                        onFindRelated?.();
                        return;
                      }
                      handleDirectSend(s.text, s.enableCodebase === true);
                    }}
                    disabled={isBusy || !!inputValue.trim()}
                    className="flex items-center justify-center border-l border-border-default px-2 text-text-muted cursor-pointer hover:bg-[var(--color-brand-500)]/[0.12] hover:text-[var(--color-brand-400)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Submit immediately"
                  >
                    <SendHorizontal size={9} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-3 pb-2.5 pt-1">
          <div className="flex flex-col rounded-2xl border border-border-strong bg-[var(--color-surface-elevated)] focus-within:border-[var(--color-brand-500)]/30 transition-colors duration-150">
            <div
              onMouseDown={handleResizeMouseDown}
              className="flex h-2.5 cursor-row-resize items-center justify-center opacity-0 hover:opacity-50 transition-opacity duration-150"
            >
              <div className="h-0.5 w-8 rounded-full bg-text-tertiary" />
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
                className={`w-full resize-none bg-transparent px-3.5 pt-1 pb-1 font-[var(--font-body)] text-body-lg leading-[1.7] text-text-primary placeholder-text-tertiary focus:outline-none disabled:opacity-50 ${manualInputHeight ? "h-full" : ""}`}
              />
            </div>
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-2">
                <QuickActionsPopover
                  actions={dropdownActions}
                  onSelect={(prompt, actionId) => {
                    setShowActions(false);
                    if (actionId === "find-related") {
                      onFindRelated?.();
                      return;
                    }
                    if (actionId === "match-epic") {
                      onSend(prompt, "match-epic");
                      return;
                    }
                    const ap = apiPrompts.find((p) => p.id === actionId);
                    if (ap) onCodebaseResearchChange(ap.enableCodebase === true);
                    fillInput(prompt);
                  }}
                  onSend={(prompt, actionId) => {
                    setShowActions(false);
                    if (actionId === "match-epic") {
                      onSend(prompt, "match-epic");
                      return;
                    }
                    const ap = apiPrompts.find((p) => p.id === actionId);
                    handleDirectSend(prompt, ap?.enableCodebase === true);
                  }}
                  open={showActions}
                  onToggle={() => setShowActions((v) => !v)}
                  onClose={() => setShowActions(false)}
                  disabled={isBusy}
                />
                {usage && (usage.inputTokens > 0 || usage.outputTokens > 0) && (
                  <span className="text-caption text-text-tertiary tabular-nums">
                    {(usage.inputTokens / 1000).toFixed(1)}k&nbsp;in&nbsp;·&nbsp;{(usage.outputTokens / 1000).toFixed(1)}k&nbsp;out
                    {usage.cost > 0 && <>&nbsp;·&nbsp;${usage.cost.toFixed(4)}</>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <ModelSelector model={model} onModelChange={onModelChange} disabled={isBusy} />
                <CodebaseToggle
                  enabled={codebaseResearch}
                  onChange={onCodebaseResearchChange}
                  disabled={isBusy}
                />
                {isBusy && onCancel ? (
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
                      isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                      ) : (
                        <SendHorizontal className="h-3 w-3" strokeWidth={2} />
                      )
                    }
                    onClick={handleSubmit}
                    disabled={!inputValue.trim() || isBusy}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
