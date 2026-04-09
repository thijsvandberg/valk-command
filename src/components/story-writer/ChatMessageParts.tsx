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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";

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
            ? "border-white/[0.15] bg-white/[0.10] text-white/70"
            : "border-white/[0.08] bg-white/[0.04] text-white/35 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white/60"
        }`}
      >
        <Info size={11} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 w-52 rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-20 p-3 ${
            isUser ? "left-0" : "right-0"
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-white/35">Sent</span>
              <span className="text-[11px] tabular-nums text-white/65">{formatTimestamp(message.timestamp)}</span>
            </div>

            {logsTaskId && onOpenLogs && (
              <>
                <div className="h-px bg-white/[0.06]" />
                <button
                  type="button"
                  onClick={() => { onOpenLogs(logsTaskId); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] cursor-pointer transition-colors duration-150"
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
  logsTaskId,
  onOpenLogs,
  onStoryKeyClick,
}: {
  message: Message;
  draftId?: string;
  draftContent?: string;
  onViewDraft?: (draftId: string) => void;
  logsTaskId?: string | null;
  onOpenLogs?: (taskId: string) => void;
  onStoryKeyClick?: (key: string) => void;
}) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);

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

  const displayContent = message.content
    .replace(/<story-draft>[\s\S]*?<\/story-draft>/g, "")
    .replace(/<related-stories>[\s\S]*?<\/related-stories>/g, "")
    .replace(/\[codebase-research:\s*(?:on|off)\]\s*/g, "")
    .trim();

  const draftOnly = !displayContent && !!draftId;
  const isLong = countWords(displayContent) > SHOW_MORE_WORD_THRESHOLD;
  const truncatedContent = isLong ? truncateAtWords(displayContent, TRUNCATE_WORD_COUNT) : displayContent;

  return (
    <div className={`group flex items-end gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser && (displayContent || draftId) && (
        <MessageInfoButton
          message={message}
          logsTaskId={logsTaskId ?? null}
          onOpenLogs={onOpenLogs}
          isUser={true}
        />
      )}

      <div
        className={`max-w-[85%] rounded-xl text-sm leading-[1.75] ${
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
              onClick={handleContentClick}
              className="description-content chat-markdown"
            >
              {renderMarkdown(expanded ? displayContent : truncatedContent)}
            </div>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`flex items-center gap-1 text-[11px] cursor-pointer transition-colors duration-150 ${
                  expanded
                    ? "mt-1 text-white/35 hover:text-white/55"
                    : "mt-1 text-white/45 hover:text-white/65"
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
      </div>

      {!isUser && (displayContent || draftId) && (
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
            ? "bg-white/[0.10] border-white/[0.15] text-white/80"
            : "bg-white/[0.04] border-white/[0.10] text-white/55 hover:text-white/75 hover:bg-white/[0.08]"
        }`}
        title="AI actions"
      />

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-lg border border-white/[0.10] bg-[var(--color-surface-floating)] py-1 shadow-xl shadow-black/30">
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
