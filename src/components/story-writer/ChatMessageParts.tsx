"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Message } from "@/types/chat";
import type { RelatedStoryCandidate } from "@/types/story-writer";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RotateCcw,
  Info,
  ExternalLink,
  Maximize2,
  Check,
  GitCompare,
  Sparkles,
  Search,
  PanelRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { TitleSuggestionChips } from "@/components/story-writer/TitleSuggestionChips";
import { TypeSuggestionChip } from "@/components/story-writer/TypeSuggestionChip";
import { LinkSuggestionChips, type LinkSuggestion } from "@/components/story-writer/LinkSuggestionChips";
import { EpicSuggestionCard, type EpicSuggestion } from "@/components/story-writer/EpicSuggestionCard";
import { SuggestionCard, SuggestionRow, ScoreBadge, LinkButton, AppliedBadge } from "@/components/story-writer/SuggestionCard";
import { TicketStatusPill, type TicketPillHoverData } from "@/components/shared/TicketStatusPill";
import { tickets } from "@/lib/api-client";
import type { JiraStatus } from "@/types/ticket";

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

import { formatTimestamp as _formatTimestamp, formatDuration as _formatDuration } from "@/lib/format-timestamp";

export const formatTimestamp = _formatTimestamp;
export const formatDuration = _formatDuration;

const VALID_RELATIONS = new Set([
  "relates to", "blocks", "is blocked by", "clones", "is cloned by", "duplicates", "is duplicated by",
]);

export function parseLinkSuggestions(content: string): LinkSuggestion[] {
  const results: LinkSuggestion[] = [];
  const seen = new Set<string>();

  // Multi-tag format: <link-suggestions>...<link key="..." relation="..." />...</link-suggestions>
  const multiMatch = content.match(/<link-suggestions>([\s\S]*?)<\/link-suggestions>/);
  if (multiMatch) {
    const inner = multiMatch[1];
    for (const m of inner.matchAll(/<link\s+key="([^"]+)"\s+relation="([^"]+)"\s*\/>/g)) {
      const key = m[1];
      const relation = VALID_RELATIONS.has(m[2]) ? m[2] : "relates to";
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, relation });
      }
    }
  }

  // Single-tag format: <link-suggestion key="..." relation="..." />
  for (const m of content.matchAll(/<link-suggestion\s+key="([^"]+)"\s+relation="([^"]+)"\s*\/>/g)) {
    const key = m[1];
    const relation = VALID_RELATIONS.has(m[2]) ? m[2] : "relates to";
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ key, relation });
    }
  }

  return results;
}

export function stripLinkSuggestionTags(content: string): string {
  return content
    .replace(/<link-suggestions>[\s\S]*?<\/link-suggestions>/g, "")
    .replace(/<link-suggestion\s[^/]*\/>/g, "");
}

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

export function parseEpicSuggestions(content: string): EpicSuggestion[] {
  const results: EpicSuggestion[] = [];
  const seen = new Set<string>();

  // XML format: <epic-suggestion><epic key="..." confidence="..." reason="..." />...</epic-suggestion>
  const xmlMatch = content.match(/<epic-suggestion>([\s\S]*?)<\/epic-suggestion>/);
  if (xmlMatch) {
    for (const m of xmlMatch[1].matchAll(/<epic\s+key="([^"]+)"\s+confidence="([^"]+)"\s+reason="([^"]+)"\s*\/>/g)) {
      const key = m[1];
      const confidence = VALID_CONFIDENCE.has(m[2]) ? m[2] as EpicSuggestion["confidence"] : "low";
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, name: key, confidence, reason: m[3] });
      }
    }
  }

  // JSON format: <json-output>[{key, name, confidence, reason}]</json-output>
  if (results.length === 0) {
    const jsonMatch = content.match(/<json-output>([\s\S]*?)<\/json-output>/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.key === "string" && typeof item.confidence === "string") {
              const key = item.key;
              const confidence = VALID_CONFIDENCE.has(item.confidence) ? item.confidence as EpicSuggestion["confidence"] : "low";
              if (!seen.has(key)) {
                seen.add(key);
                results.push({
                  key,
                  name: typeof item.name === "string" ? item.name : key,
                  confidence,
                  reason: typeof item.reason === "string" ? item.reason : "",
                });
              }
            }
          }
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  return results;
}

export function stripEpicSuggestionTags(content: string): string {
  let result = content.replace(/<epic-suggestion>[\s\S]*?<\/epic-suggestion>/g, "");
  // Only strip <json-output> blocks that contain epic suggestion data (have "confidence" key)
  result = result.replace(/<json-output>([\s\S]*?)<\/json-output>/g, (match, inner) => {
    try {
      const parsed = JSON.parse(inner);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.confidence === "string") {
        return "";
      }
    } catch {
      // Not JSON, leave it
    }
    return match;
  });
  return result;
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

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

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
        } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
      >
        <Info size={11} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 w-52 rounded-xl border border-border-strong bg-surface-floating shadow-lg z-20 p-3 ${
            isUser ? "left-0" : "right-0"
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption font-medium uppercase tracking-label text-text-tertiary">Sent</span>
              <span className="text-label tabular-nums text-text-secondary">{formatTimestamp(message.timestamp)}</span>
            </div>

            {logsTaskId && onOpenLogs && (
              <>
                <div className="h-px bg-overlay-default" />
                <button
                  type="button"
                  onClick={() => { onOpenLogs(logsTaskId); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-label text-text-secondary hover:text-text-primary hover:bg-hover-interactive cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
  onCreateLink,
  linkedIssueKeys,
  onApplyEpic,
  currentEpicKey,
  currentTitle,
  currentType,
  isLatestDraft,
}: {
  message: Message;
  draftId?: string;
  draftContent?: string;
  isLatestDraft?: boolean;
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
  onCreateLink?: (targetKey: string, relation: string) => Promise<void>;
  linkedIssueKeys?: Set<string>;
  onApplyEpic?: (epicKey: string) => Promise<void>;
  currentEpicKey?: string | null;
  currentTitle?: string;
  currentType?: string;
}) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState<boolean>(() => Boolean(isLatestDraft && draftId));
  const [draftAccepted, setDraftAccepted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // The latest draft in the chat shows expanded; when a newer draft arrives this
  // one is demoted to collapsed. Accepted drafts default to collapsed. Manual
  // toggles in between are preserved since this only recomputes when one of the
  // tracked inputs changes (adjust-state-during-render, not an effect).
  const [draftSyncKey, setDraftSyncKey] = useState({ isLatestDraft, draftId, draftAccepted });
  if (
    draftSyncKey.isLatestDraft !== isLatestDraft ||
    draftSyncKey.draftId !== draftId ||
    draftSyncKey.draftAccepted !== draftAccepted
  ) {
    setDraftSyncKey({ isLatestDraft, draftId, draftAccepted });
    if (draftId) {
      setDraftExpanded(Boolean(isLatestDraft) && !draftAccepted);
    }
  }

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
  const hasRelatedBlock = message.content.includes("<related-stories>");
  const baseContent = stripEpicSuggestionTags(
    stripLinkSuggestionTags(
      (() => {
        let c = message.content
          .replace(/<story-draft>[\s\S]*?<\/story-draft>/g, "")
          .replace(/<related-stories>[\s\S]*?<\/related-stories>/g, "")
          .replace(/<related-request\b[^>]*?\/?>(?:<\/related-request>)?/gi, "")
          .replace(/<html-report>[\s\S]*?<\/html-report>/g, "")
          .replace(/<summary>[\s\S]*?<\/summary>/g, "")
          .replace(/<type-suggestion>[\s\S]*?<\/type-suggestion>/g, "")
          .replace(/\[codebase-research:\s*(?:on|off)\]\s*/g, "");
        // When the message contained related-stories results, strip the verbose
        // scoring breakdown since the card already displays all candidates.
        if (hasRelatedBlock) {
          c = c.replace(/\*{0,2}(?:Already linked|Candidates? pool|Scoring)[:\s*][\s\S]*/i, "").trim();
        }
        return c;
      })(),
    ),
  );

  const epicSuggestions = message.role === "assistant"
    ? parseEpicSuggestions(message.content)
    : [];

  const typeSuggestion = (() => {
    if (message.role !== "assistant") return null;
    const match = message.content.match(/<type-suggestion>([\s\S]*?)<\/type-suggestion>/);
    if (!match) return null;
    const suggested = match[1].trim().toLowerCase();
    const valid = ["story", "bug", "task", "spike"];
    return valid.includes(suggested) ? suggested : null;
  })();

  const linkSuggestions = message.role === "assistant"
    ? parseLinkSuggestions(message.content)
    : [];

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
  const isCancelled = !!message.cancelled;

  return (
    <div className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
    <div className={`flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"} w-full`}>
      {isUser && (displayContent || draftId) && !isCancelled && (
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
        className={`text-body-lg leading-[1.75] min-w-0 ${
          allTitleSuggestions.length > 0 || draftId ? "max-w-[92%]" : isUser ? "max-w-[70%]" : "max-w-[75%]"
        } ${
          draftOnly
            ? ""
            : isUser
              ? "px-4 py-3 rounded-2xl rounded-br-lg bg-[var(--color-brand-600)]/[0.18] text-text-primary border border-[var(--color-brand-500)]/[0.18] shadow-sm"
              : "px-4 py-3 rounded-2xl rounded-bl-lg bg-surface-floating text-text-primary border border-border-default shadow-sm"
        } ${isCancelled ? "opacity-40" : ""}`}
      >
        {displayContent && (
          <div>
            <div
              onClick={handleContentClick}
              className="description-content chat-markdown"
            >
              {renderMarkdown(expanded ? displayContent : truncatedContent, { linkifyRefs: true })}
            </div>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-border-default bg-overlay-subtle px-2.5 py-0.5 text-label text-text-tertiary cursor-pointer hover:text-text-secondary hover:border-border-strong hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {allTitleSuggestions.length > 0 && onApplyTitle && (
          <TitleSuggestionChips titles={allTitleSuggestions} onApply={onApplyTitle} currentTitle={currentTitle} />
        )}
        {typeSuggestion && onApplyType && (
          <TypeSuggestionChip type={typeSuggestion} onApply={onApplyType} currentType={currentType} />
        )}
        {linkSuggestions.length > 0 && onCreateLink && (
          <LinkSuggestionChips
            suggestions={linkSuggestions}
            linkedIssueKeys={linkedIssueKeys ?? new Set()}
            onLink={onCreateLink}
            messageId={message.id}
          />
        )}
        {epicSuggestions.length > 0 && onApplyEpic && (
          <EpicSuggestionCard
            suggestions={epicSuggestions}
            currentEpicKey={currentEpicKey ?? null}
            onApply={onApplyEpic}
            messageId={message.id}
          />
        )}
        {contentAfter && (
          <div
            onClick={handleContentClick}
            className={`description-content chat-markdown ${allTitleSuggestions.length > 0 ? "mt-2" : ""}`}
          >
            {renderMarkdown(contentAfter, { linkifyRefs: true })}
          </div>
        )}
        {draftId && (
          <div className={`group/draft ${displayContent || contentAfter || allTitleSuggestions.length > 0 ? "mt-3" : ""} rounded-lg border border-border-default overflow-hidden`}>
            <div
              onClick={() => setDraftExpanded((v) => !v)}
              className="flex min-h-8 items-center gap-1.5 px-3 py-1 bg-overlay-subtle border-b border-border-default cursor-pointer hover:bg-overlay-default transition-colors duration-150"
            >
              <FileText size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              <span className="text-caption font-medium uppercase tracking-label text-text-tertiary">Draft updated</span>
              {draftAccepted && (
                <span className="ml-auto flex items-center mr-1.5">
                  <span className="inline-flex h-5 items-center gap-1 text-caption font-medium uppercase tracking-label text-text-muted">
                    <Check size={11} strokeWidth={2} className="shrink-0" />
                    Accepted
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftExpanded((v) => !v);
                }}
                aria-label={draftExpanded ? "Collapse draft" : "Expand draft"}
                className={`${!draftAccepted ? "ml-auto " : ""}flex items-center justify-center shrink-0 cursor-pointer text-text-muted hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                <ChevronDown
                  size={12}
                  strokeWidth={1.5}
                  className={`transition-transform duration-150 ${draftExpanded ? "" : "-rotate-90"}`}
                />
              </button>
            </div>
            {draftExpanded && draftContent && (
              <>
                <div className="relative">
                  {(onViewDraft || onFocusDraft) && (
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border-default bg-surface-floating p-0.5 opacity-0 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.18)] transition-opacity duration-150 group-hover/draft:opacity-100 focus-within:opacity-100">
                      {onViewDraft && (
                        <button
                          type="button"
                          onClick={() => onViewDraft(draftId)}
                          className="flex items-center gap-1.5 rounded px-2 py-1 text-caption font-medium text-text-tertiary cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                          title="Open the draft in the side editor"
                        >
                          <PanelRight size={12} strokeWidth={1.5} />
                          Open in editor
                        </button>
                      )}
                      {onFocusDraft && (
                        <button
                          type="button"
                          onClick={() => onFocusDraft(draftId)}
                          className="flex items-center gap-1.5 rounded px-2 py-1 text-caption font-medium text-text-tertiary cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                          title="Open the draft in fullscreen focus mode"
                        >
                          <Maximize2 size={12} strokeWidth={1.5} />
                          Open in fullscreen
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    className="px-3 py-2.5 overflow-y-auto"
                    style={{
                      maxHeight: containerWidth > 0
                        ? Math.min(Math.round(containerWidth * 0.65), typeof window !== "undefined" ? window.innerHeight - 180 : 600)
                        : 300,
                    }}
                  >
                    <div className="description-content chat-markdown text-body-sm leading-prose text-text-secondary">
                      {renderMarkdown(draftContent, { linkifyRefs: true })}
                    </div>
                  </div>
                </div>
                {onAcceptDraft && !draftAccepted && (
                  <div className="border-t border-border-default px-3 py-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onAcceptDraft(draftId);
                        setDraftAccepted(true);
                      }}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm font-medium text-[var(--color-brand-500)] bg-[var(--color-brand-500)]/[0.1] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.16] active:bg-[var(--color-brand-500)]/[0.2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                    >
                      <Check size={12} strokeWidth={2} />
                      Accept draft
                    </button>
                    {hasExistingDraft && onShowDiff && (
                      <button
                        type="button"
                        onClick={() => onShowDiff(draftId)}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm font-medium text-text-tertiary cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
                      >
                        <GitCompare size={12} strokeWidth={2} />
                        View diff
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!isUser && !isCancelled && (displayContent || contentAfter || draftId || allTitleSuggestions.length > 0) && (
        <MessageInfoButton
          message={message}
          logsTaskId={logsTaskId ?? null}
          onOpenLogs={onOpenLogs}
          isUser={false}
        />
      )}
    </div>
    {isCancelled && (
      <span className={`mt-1 text-caption font-medium text-red-400/60 uppercase tracking-wider select-none ${isUser ? "mr-1" : "ml-[34px]"}`} data-testid="cancelled-badge">
        Cancelled
      </span>
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
        className="flex w-full items-center gap-2 px-3 py-2 cursor-pointer hover:bg-overlay-subtle transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
              className={`description-content chat-markdown text-body-sm leading-prose text-text-secondary overflow-hidden ${
                !isOverflowing ? "" : ""
              }`}
              style={isOverflowing ? { maxHeight: "none" } : undefined}
            >
              {renderMarkdown(content, { linkifyRefs: true })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeJiraStatus(raw: string | null | undefined): JiraStatus {
  const upper = (raw ?? "").toUpperCase().trim();
  const VALID: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];
  return (VALID.find((s) => s === upper) ?? "TO DO") as JiraStatus;
}

export function RelatedStoriesInline({
  candidates,
  onLink,
  onOpenPanel,
}: {
  candidates: RelatedStoryCandidate[];
  onLink: (candidateId: string, isLinked: boolean) => Promise<void>;
  onOpenPanel?: () => void;
}) {
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [hoverByKey, setHoverByKey] = useState<Record<string, TicketPillHoverData>>({});

  // The resolved sprint name comes from the candidate (server-enriched), keyed by
  // jiraKey so the hover effect can fold it in without re-fetching.
  const sprintNameByKey = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of candidates) map[c.jiraKey] = c.sprintName ?? null;
    return map;
  }, [candidates]);

  useEffect(() => {
    let cancelled = false;
    const keysToResolve = candidates
      .map((c) => c.jiraKey)
      .filter((k) => !hoverByKey[k]);
    if (keysToResolve.length === 0) return;

    for (const key of keysToResolve) {
      tickets.get(key)
        .then((data) => {
          if (cancelled || !data) return;
          setHoverByKey((prev) => ({
            ...prev,
            [key]: {
              title: data.title,
              storyPoints: data.storyPoints,
              businessValue: data.businessValue,
              sprintId: data.sprintId ?? null,
              sprintName: sprintNameByKey[key] ?? null,
              epicKey: data.epicKey,
              epic: data.epic,
              assignee: data.assignee ?? null,
              reporter: data.reporter ?? null,
              openSubtaskCount: data.openSubtaskCount ?? 0,
              totalSubtaskCount: data.totalSubtaskCount ?? 0,
              flagged: data.flagged,
            },
          }));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Epics are never valid related stories — guard against any stale cached rows.
  const visibleCandidates = candidates.filter(
    (c) => (c.issueType ?? "").toLowerCase() !== "epic",
  );

  if (visibleCandidates.length === 0) return null;

  const anyLinked = visibleCandidates.some((c) => c.isLinked);

  const handleLink = async (id: string, isLinked: boolean) => {
    setLinkingId(id);
    await onLink(id, isLinked);
    setLinkingId(null);
  };

  return (
    <SuggestionCard
      icon={<Search size={10} strokeWidth={1.5} className="text-text-muted" />}
      title="Related stories"
      headerRight={
        (anyLinked || onOpenPanel) ? (
          <span className="flex items-center gap-2.5">
            {anyLinked && <AppliedBadge />}
            {onOpenPanel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPanel();
                }}
                title="Open in side panel"
                aria-label="Open in side panel"
                className="flex size-5 items-center justify-center rounded text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <PanelRight size={13} strokeWidth={1.5} />
              </button>
            )}
          </span>
        ) : undefined
      }
    >
      {visibleCandidates.map((c) => (
        <SuggestionRow key={c.id} active={c.isLinked}>
          <ScoreBadge score={c.score} />
          <TicketStatusPill
            ticketKey={c.jiraKey}
            issueType={(c.issueType ?? "task").toLowerCase()}
            jiraStatus={normalizeJiraStatus(c.status)}
            title={c.title}
            size="sm"
            variant="list"
            hoverData={
              hoverByKey[c.jiraKey]
                ? { ...hoverByKey[c.jiraKey], sprintName: c.sprintName ?? hoverByKey[c.jiraKey].sprintName }
                : undefined
            }
          />
          <span className="min-w-0 flex-1 truncate text-label text-text-secondary">
            {c.title}
          </span>
          <LinkButton
            linked={c.isLinked}
            loading={linkingId === c.id}
            onLink={() => handleLink(c.id, true)}
            onUnlink={() => handleLink(c.id, false)}
          />
        </SuggestionRow>
      ))}
    </SuggestionCard>
  );
}

// QuickActionsPopover moved to the shared chat-controls module so the standalone
// chat and the Story Writer chat use one implementation. Re-exported here to keep
// existing import paths working.
export { QuickActionsPopover, type QuickAction } from "@/components/shared/chat-controls/QuickActionsPopover";
