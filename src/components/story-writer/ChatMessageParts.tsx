"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Message } from "@/types/chat";
import type { RelatedStoryCandidateRow } from "@/db/schema";
import {
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Link2,
  AlertCircle,
  RotateCcw,
  Info,
  ExternalLink,
  Zap,
  Maximize2,
  Check,
  GitCompare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { TitleSuggestionChips } from "@/components/story-writer/TitleSuggestionChips";
import { TypeSuggestionChip } from "@/components/story-writer/TypeSuggestionChip";

export const SHOW_MORE_WORD_THRESHOLD = 80;
export const TRUNCATE_WORD_COUNT = 40;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((s) => s.length > 0).length;
}

export function truncateAtWords(text: string, maxWords: number): string {
  const parts = text.split(/(\s+)/);
  let count = 0;
  let idx = 0;
  for (; idx < parts.length; idx++) {
    const w = parts[idx].trim();
    if (w.length > 0) {
      count++;
      if (count >= maxWords) {
        idx++;
        break;
      }
    }
  }
  return parts.slice(0, idx).join("") + "...";
}

export function formatTimestamp(iso: string): string {
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

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainSeconds}s`;
}

export function MessageInfoButton({
  message,
  logsTaskId,
  onOpenLogs,
  isUser,
}: {
  message: Message;
  logsTaskId: string | null;
  onOpenLogs?: (taskId: string) => void;
  isUser: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 self-end mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Message info"
        className={`flex size-[22px] items-center justify-center rounded-full border cursor-pointer transition-colors duration-150 ${
          open
            ? "border-border-strong bg-overlay-strong text-text-secondary"
            : "border-border-strong bg-overlay-subtle text-text-tertiary hover:border-border-strong hover:bg-overlay-strong hover:text-text-secondary"
        }`}
      >
        <Info size={11} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 w-52 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)] z-20 p-3 ${
            isUser ? "left-0" : "right-0"
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">Sent</span>
              <span className="text-label tabular-nums text-text-secondary">{formatTimestamp(message.timestamp)}</span>
            </div>

            {logsTaskId && onOpenLogs && (
              <>
                <div className="h-px bg-overlay-default" />
                <button
                  type="button"
                  onClick={() => { onOpenLogs(logsTaskId); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-label text-text-secondary hover:text-text-primary hover:bg-hover-interactive cursor-pointer transition-colors duration-150"
                >
                  <ExternalLink size={11} strokeWidth={1.5} className="shrink-0" />
                  View execution logs
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatMessage({
  message,
  draftId,
  draftContent,
  onViewDraft,
  onFocusDraft,
  onAcceptDraft,
  onShowDiff,
  hasExistingDraft,
  logsTaskId,
  onOpenLogs,
  onStoryKeyClick,
  onApplyTitle,
  onApplyType,
}: {
  message: Message;
  draftId?: string;
  draftContent?: string;
  onViewDraft?: (draftId: string) => void;
  onFocusDraft?: (draftId: string) => void;
  onAcceptDraft?: (draftId: string) => void;
  onShowDiff?: (draftId: string) => void;
  hasExistingDraft?: boolean;
  logsTaskId?: string | null;
  onOpenLogs?: (taskId: string) => void;
  onStoryKeyClick?: (key: string) => void;
  onApplyTitle?: (title: string) => void;
  onApplyType?: (type: string) => void;
}) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);
  const [draftAccepted, setDraftAccepted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onStoryKeyClick) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (e.metaKey || e.ctrlKey) return;
    const href = anchor.getAttribute("href") ?? "";
    const match = href.match(/atlassian\.net\/browse\/([A-Z]+-\d+)/);
    if (!match) return;
    e.preventDefault();
    onStoryKeyClick(match[1]);
  }, [onStoryKeyClick]);

  // Strip non-title-suggestions tags first, keep the title-suggestions tag for positional splitting
  const baseContent = message.content
    .replace(/<story-draft>[\s\S]*?<\/story-draft>/g, "")
    .replace(/<related-stories>[\s\S]*?<\/related-stories>/g, "")
    .replace(/<html-report>[\s\S]*?<\/html-report>/g, "")
    .replace(/<summary>[\s\S]*?<\/summary>/g, "")
    .replace(/<type-suggestion>[\s\S]*?<\/type-suggestion>/g, "")
    .replace(/\[codebase-research:\s*(?:on|off)\]\s*/g, "");

  const typeSuggestion = (() => {
    if (message.role !== "assistant") return null;
    const match = message.content.match(/<type-suggestion>([\s\S]*?)<\/type-suggestion>/);
    if (!match) return null;
    const suggested = match[1].trim().toLowerCase();
    const valid = ["story", "bug", "task", "spike"];
    return valid.includes(suggested) ? suggested : null;
  })();

  // Structured title suggestions (Phase 1 tag format)
  const titleSuggestions = (() => {
    if (message.role !== "assistant") return [];
    const match = baseContent.match(/<title-suggestions>([\s\S]*?)<\/title-suggestions>/);
    if (!match) return [];
    return match[1]
      .split(/\n/)
      .map((line) => line.replace(/^[\s]*[-*]\s*/, "").trim())
      .filter((line) => line.length > 0);
  })();

  // Split content around the tag so text after the tag renders below the chips
  const titleTagSplit = baseContent.match(/([\s\S]*?)<title-suggestions>[\s\S]*?<\/title-suggestions>([\s\S]*)/);
  const contentBefore = titleTagSplit
    ? titleTagSplit[1].trim()
    : baseContent.replace(/<title-suggestions>[\s\S]*?<\/title-suggestions>/g, "").trim();
  const contentAfter = titleTagSplit ? titleTagSplit[2].trim() : "";

  // Legacy fallback: "Here are N title options:" + numbered **bold** items
  const legacyTitleSuggestions = titleSuggestions.length === 0 && message.role === "assistant"
    ? (() => {
        const pattern = /here are \d+ title (?:options|suggestions|ideas)[:\s]*\n((?:\d+\.\s+\*\*.+\*\*[^\n]*\n?)+)/i;
        const match = baseContent.match(pattern);
        if (!match) return [];
        return [...match[1].matchAll(/\d+\.\s+\*\*(.+?)\*\*/g)]
          .map((m) => m[1].trim())
          .filter(Boolean);
      })()
    : [];

  const allTitleSuggestions = titleSuggestions.length > 0 ? titleSuggestions : legacyTitleSuggestions;

  // For backward-compatible logic (Show more, draftOnly), treat contentBefore as the primary display content
  const displayContent = contentBefore || (titleSuggestions.length === 0 ? contentAfter : "");
  const draftOnly = !displayContent && !contentAfter && !allTitleSuggestions.length && !!draftId;
  const isLong = countWords(displayContent) > SHOW_MORE_WORD_THRESHOLD;
  const truncatedContent = isLong ? truncateAtWords(displayContent, TRUNCATE_WORD_COUNT) : displayContent;

  return (
    <div className={`group flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser && (displayContent || draftId) && (
        <MessageInfoButton
          message={message}
          logsTaskId={logsTaskId ?? null}
          onOpenLogs={onOpenLogs}
          isUser={true}
        />
      )}

      {!isUser && !draftOnly && (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-500)]/[0.12] self-end mb-0.5">
          <Sparkles size={12} className="text-[var(--color-brand-400)]" strokeWidth={1.5} />
        </div>
      )}

      <div
        ref={containerRef}
        className={`text-sm leading-[1.75] ${
          allTitleSuggestions.length > 0 || draftId ? "max-w-[92%]" : isUser ? "max-w-[70%]" : "max-w-[75%]"
        } ${
          draftOnly
            ? ""
            : isUser
              ? "px-4 py-3 rounded-2xl rounded-br-lg bg-[var(--color-brand-600)]/[0.18] text-text-primary border border-[var(--color-brand-500)]/[0.18] shadow-sm"
              : "px-4 py-3 rounded-2xl rounded-bl-lg bg-[var(--color-surface-floating)] text-text-primary border border-border-default shadow-sm"
        }`}
      >
        {displayContent && (
          <div>
            <div
              onClick={handleContentClick}
              className="description-content chat-markdown"
            >
              {renderMarkdown(expanded ? displayContent : truncatedContent)}
            </div>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-border-default bg-overlay-subtle px-2.5 py-0.5 text-label text-text-tertiary cursor-pointer hover:text-text-secondary hover:border-border-strong hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-150"
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {allTitleSuggestions.length > 0 && onApplyTitle && (
          <TitleSuggestionChips titles={allTitleSuggestions} onApply={onApplyTitle} />
        )}
        {typeSuggestion && onApplyType && (
          <TypeSuggestionChip type={typeSuggestion} onApply={onApplyType} />
        )}
        {contentAfter && (
          <div
            onClick={handleContentClick}
            className={`description-content chat-markdown ${allTitleSuggestions.length > 0 ? "mt-2" : ""}`}
          >
            {renderMarkdown(contentAfter)}
          </div>
        )}
        {draftId && (
          <div className={`${displayContent || contentAfter || allTitleSuggestions.length > 0 ? "mt-2.5" : ""} rounded-lg border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.04]`}>
            <div className="flex items-center gap-1 px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => setDraftExpanded((v) => !v)}
                className="flex flex-1 items-center gap-1.5 px-2 py-1 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer rounded-md hover:bg-[var(--color-brand-500)]/10 transition-colors duration-150"
              >
                <FileText size={12} strokeWidth={1.5} className="shrink-0" />
                Draft updated
                {draftExpanded ? <ChevronUp size={11} className="ml-auto shrink-0" /> : <ChevronDown size={11} className="ml-auto shrink-0" />}
              </button>
              <div className="h-4 w-px bg-[var(--color-brand-500)]/10 shrink-0" />
              <button
                type="button"
                onClick={() => onViewDraft?.(draftId)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-[var(--color-brand-400)]/60 cursor-pointer hover:text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10 transition-colors duration-150"
                title="Open in editor"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => onFocusDraft?.(draftId)}
                className="flex items-center justify-center rounded-md size-7 text-[var(--color-brand-400)]/40 cursor-pointer hover:text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10 transition-colors duration-150"
                title="Focus mode"
              >
                <Maximize2 size={11} strokeWidth={1.5} />
              </button>
            </div>
            {draftExpanded && draftContent && (
              <>
                <div
                  className="border-t border-[var(--color-brand-500)]/10 px-3 py-2.5 overflow-y-auto"
                  style={{
                    maxHeight: containerWidth > 0
                      ? Math.min(Math.round(containerWidth * 0.65), typeof window !== "undefined" ? window.innerHeight - 180 : 600)
                      : 300,
                  }}
                >
                  <div className="description-content chat-markdown text-xs leading-[1.7] text-text-secondary">
                    {renderMarkdown(draftContent)}
                  </div>
                </div>
                {onAcceptDraft && draftId && (
                  <div className="border-t border-[var(--color-brand-500)]/10 px-3 py-2 flex items-center gap-2">
                    {draftAccepted ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <Check size={12} strokeWidth={2} />
                        Accepted
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onAcceptDraft(draftId);
                            setDraftAccepted(true);
                          }}
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10 cursor-pointer hover:bg-[var(--color-brand-500)]/20 active:bg-[var(--color-brand-500)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                        >
                          <Check size={12} strokeWidth={2} />
                          Accept draft
                        </button>
                        {hasExistingDraft && onShowDiff && (
                          <button
                            type="button"
                            onClick={() => onShowDiff(draftId)}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-tertiary cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                          >
                            <GitCompare size={12} strokeWidth={2} />
                            View diff
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!isUser && (displayContent || contentAfter || draftId || allTitleSuggestions.length > 0) && (
        <MessageInfoButton
          message={message}
          logsTaskId={logsTaskId ?? null}
          onOpenLogs={onOpenLogs}
          isUser={false}
        />
      )}
    </div>
  );
}

export function DraftCard({ content }: { content: string }) {
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
    <div className="rounded-lg border border-border-strong bg-overlay-subtle">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 cursor-pointer hover:bg-overlay-subtle transition-colors duration-150"
      >
        <FileText size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
        <span className="text-label font-medium text-text-tertiary">Current draft</span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp size={12} className="text-text-muted" />
          ) : (
            <ChevronDown size={12} className="text-text-muted" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border-default px-3 py-2.5">
          <div className="relative">
            <div
              ref={contentRef}
              className={`description-content chat-markdown text-xs leading-[1.7] text-text-secondary overflow-hidden ${
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

export function RelatedStoriesInline({
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-caption font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          Related Stories
        </span>
        {onOpenPanel && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="text-caption text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors duration-150"
          >
            Open panel
          </button>
        )}
      </div>
      <div className="divide-y divide-border-subtle">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`shrink-0 text-caption font-bold tabular-nums w-6 text-right ${c.score >= 80 ? "text-emerald-400" : c.score >= 60 ? "text-amber-400" : "text-text-tertiary"}`}>
              {c.score}
            </span>
            <a
              href={c.jiraUrl ?? `${jiraBase}${c.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-label text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] shrink-0 transition-colors duration-100"
            >
              {c.jiraKey}
            </a>
            <span className="min-w-0 flex-1 truncate text-label text-text-secondary">
              {c.title}
            </span>
            <button
              type="button"
              onClick={() => handleLink(c.id, !c.isLinked)}
              disabled={linkingId === c.id}
              className={`shrink-0 flex items-center gap-1 rounded border px-1.5 py-0.5 text-caption font-medium cursor-pointer transition-colors duration-150 disabled:opacity-50 ${
                c.isLinked
                  ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                  : "border-border-strong text-text-tertiary hover:border-[var(--color-brand-500)]/20 hover:text-[var(--color-brand-400)]"
              }`}
            >
              {linkingId === c.id ? (
                <Loader2 size={9} className="animate-spin" />
              ) : c.isLinked ? (
                <Link2 size={9} strokeWidth={1.5} />
              ) : null}
              {c.isLinked ? "Linked" : "Link"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickActionsPopover({
  actions,
  onSelect,
  open,
  onToggle,
  onClose,
  disabled,
}: {
  actions: { id: string; label: string; icon: LucideIcon; prompt: string; enabled: boolean }[];
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
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon={<Zap size={14} strokeWidth={1.5} />}
        onClick={onToggle}
        disabled={disabled}
        className={`shrink-0 ${
          open
            ? "bg-overlay-strong border-border-strong text-text-primary"
            : "bg-overlay-subtle border-border-strong text-text-secondary hover:text-text-secondary hover:bg-overlay-strong"
        }`}
        title="AI actions"
        aria-label="AI actions"
      />

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-xl shadow-black/30">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => action.enabled && onSelect(action.prompt, action.id)}
                disabled={!action.enabled}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                  action.enabled
                    ? "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                    : "text-text-muted cursor-not-allowed"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} className="shrink-0" />
                <span>{action.label}</span>
                {!action.enabled && (
                  <span className="ml-auto text-caption text-text-muted">soon</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
