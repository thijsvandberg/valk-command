"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Conversation, SprintGoalMetadata } from "@/types/chat";
import type { ReviewStoryData } from "@/lib/agent-client";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { LoadingState } from "@/components/shared/LoadingState";
import { ChatBubble } from "@/components/shared/ChatBubble";
import { markdownComponents } from "./markdown-components";
import { CopyActions } from "./CopyActions";
import { SprintGoalActions } from "./SprintGoalActions";
import { isInvestigationResult, parseInvestigationResult } from "@/lib/investigation-parser";
import { InvestigationResult } from "./investigation/InvestigationResult";
import { formatTimestamp } from "@/lib/format-timestamp";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  error: string | null;
  conversation?: Conversation | null;
  showToast?: (msg: string) => void;
}

function verdictColor(verdict: string): string {
  if (verdict === "Ready for sprint") return "#34d399";
  if (verdict === "Minor issues") return "#fbbf24";
  if (verdict === "Needs work") return "#fb923c";
  return "#f87171";
}

function statusIcon(status: string): string {
  if (status === "pass" || status === "na") return "\u2713";
  if (status === "partial") return "~";
  return "\u2717";
}

function statusColor(status: string): string {
  if (status === "pass" || status === "na") return "#34d399";
  if (status === "partial") return "#fbbf24";
  return "#f87171";
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-overlay-strong">
      <div
        className="h-full rounded-full transition-[width] duration-150"
        style={{ width: `${pct}%`, backgroundColor: verdictColor(pct >= 90 ? "Ready for sprint" : pct >= 75 ? "Minor issues" : pct >= 60 ? "Needs work" : "Not ready") }}
      />
    </div>
  );
}

function ReviewStoryCard({ data }: { data: ReviewStoryData }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <a href={data.issue.url} target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] text-xs font-medium hover:underline">
            {data.issue.key}
          </a>
          <span className="text-text-tertiary text-xs ml-2">{data.issue.type}</span>
          <h3 className="text-text-primary text-sm font-medium mt-0.5 leading-snug">{data.issue.summary}</h3>
          <div className="flex gap-3 mt-1 text-label text-text-tertiary">
            {data.issue.sprint && <span>{data.issue.sprint}</span>}
            {data.issue.assignee && <span>{data.issue.assignee}</span>}
            <span>{data.issue.status}</span>
          </div>
        </div>
      </div>

      {/* Score */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-text-primary">{data.score}</span>
          <span className="text-sm text-text-tertiary">/ {data.maxScore}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: verdictColor(data.verdict) + "20", color: verdictColor(data.verdict) }}>
            {data.verdict}
          </span>
        </div>
        <div className="mt-1.5">
          <ScoreBar score={data.score} max={data.maxScore} />
        </div>
      </div>

      {/* Criteria table */}
      <div className="space-y-1">
        {data.criteria.map((c) => (
          <div key={c.name}>
            <div className="flex items-center gap-2 py-1">
              <span className="text-xs w-4 text-center" style={{ color: statusColor(c.status) }}>{statusIcon(c.status)}</span>
              <span className="text-xs text-text-secondary flex-1">{c.name}</span>
              <span className="text-xs font-mono" style={{ color: c.score === c.maxScore ? "#34d399" : c.score === 0 ? "#f87171" : "#fbbf24" }}>
                {c.score}
              </span>
              <span className="text-xs text-text-muted font-mono">/{c.maxScore}</span>
            </div>
            {c.subItems && c.status !== "pass" && (
              <div className="ml-6 space-y-0.5">
                {c.subItems.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <span className="text-caption w-3 text-center mt-0.5" style={{ color: statusColor(s.status) }}>{statusIcon(s.status)}</span>
                    <div className="flex-1">
                      <span className="text-label text-text-secondary">{s.name}</span>
                      {s.issue && <p className="text-label text-text-tertiary mt-0.5">{s.issue}</p>}
                    </div>
                    <span className="text-caption font-mono text-text-tertiary">{s.score}/{s.maxScore}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Issues & suggestions */}
      {data.issues.length > 0 && (
        <div className="border-t border-border-default pt-3 space-y-2">
          <p className="text-label text-text-tertiary font-medium uppercase tracking-wider">Suggestions</p>
          {data.issues.map((issue, i) => (
            <div key={i} className="text-xs">
              <span className="text-text-secondary font-medium">{issue.criterion}</span>
              {issue.location && <span className="text-text-tertiary"> ({issue.location})</span>}
              <p className="text-text-tertiary mt-0.5">{issue.problem}</p>
              <p className="text-[#60a5fa]/70 mt-0.5">{issue.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <p className="text-xs text-text-tertiary border-t border-border-default pt-3">{data.summary}</p>
    </div>
  );
}

function parseJsonOutput(raw: string): unknown | null {
  const match = raw.match(/<json-output>([\s\S]*?)<\/json-output>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function preprocessMarkdown(raw: string): string {
  return raw
    // Strip known XML wrapper tags used by the story writer skill
    .replace(/<\/?story-draft>/g, "")
    // Convert inline <br> to newline
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function parseSprintGoalMetadata(conversation?: Conversation | null): SprintGoalMetadata | null {
  if (!conversation?.metadata) return null;
  if (!conversation.title.startsWith("Sprint Goal:")) return null;
  try {
    const parsed = JSON.parse(conversation.metadata);
    if (parsed.sprintId && parsed.sprintName) return parsed as SprintGoalMetadata;
  } catch { /* ignore */ }
  return null;
}

function MessageContent({ content }: { content: string }) {
  // JSON output (structured skill results)
  const jsonData = parseJsonOutput(content);
  if (jsonData !== null) {
    if (typeof jsonData === "object" && jsonData && "skill" in jsonData && (jsonData as ReviewStoryData).skill === "review-story") {
      return <ReviewStoryCard data={jsonData as ReviewStoryData} />;
    }
    return <pre className="text-xs text-text-secondary whitespace-pre-wrap">{JSON.stringify(jsonData, null, 2)}</pre>;
  }

  // HTML report (legacy)
  const htmlMatch = content.match(/<html-report>([\s\S]*?)<\/html-report>/);
  if (htmlMatch) {
    const html = htmlMatch[1].trim();
    const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/);
    const summary = summaryMatch ? summaryMatch[1].trim() : null;
    return (
      <div className="space-y-3">
        {summary && <p className="text-text-secondary text-xs">{summary}</p>}
        <iframe
          srcDoc={html}
          className="w-full rounded-lg border border-border-default"
          style={{ minHeight: 400, maxHeight: 800, background: "white" }}
          sandbox="allow-same-origin"
          onLoad={(e) => {
            const frame = e.target as HTMLIFrameElement;
            const height = frame.contentDocument?.documentElement?.scrollHeight;
            if (height) frame.style.height = `${Math.min(height + 16, 800)}px`;
          }}
        />
      </div>
    );
  }

  // Investigation result (structured rendering)
  const investigationData = parseInvestigationResult(content);
  if (investigationData) {
    return <InvestigationResult data={investigationData} rawContent={content} />;
  }

  // Markdown
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {preprocessMarkdown(content)}
    </ReactMarkdown>
  );
}


export default function MessageList({ messages, loading, error, conversation, showToast }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const sprintGoalMeta = useMemo(() => parseSprintGoalMetadata(conversation), [conversation]);

  // Find the last assistant message index for sprint goal actions
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when new messages arrive and user was at bottom
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // On initial load, always scroll to bottom
    if (prevMessageCountRef.current === 0 && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  if (loading && messages.length === 0) {
    return <LoadingState label="Loading messages..." />;
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <InlineAlert variant="error">{error}</InlineAlert>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-text-tertiary">Send a message to start the conversation.</p>
      </div>
    );
  }

  const lastIdx = messages.length - 1;

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message, idx) => {
          if (!message) return null;
          const isSending = message.id.startsWith("optimistic-");
          const isInvestigation = message.role === "assistant" && isInvestigationResult(message.content);
          const isLast = idx === lastIdx;
          const showSprintActions = sprintGoalMeta && showToast && message.role === "assistant" && idx === lastAssistantIdx && !isSending;
          const ts = message.timestamp ? formatTimestamp(message.timestamp) : null;

          // Investigation results use a report-style container instead of a chat bubble
          if (isInvestigation) {
            return (
              <div key={message.id} className="group/msg flex flex-col items-start">
                <div
                  className={`chat-bubble-assistant w-full rounded-xl border border-border-default bg-[var(--color-surface-floating)] px-5 py-4 text-sm leading-[1.7] font-[var(--font-body)] text-text-primary ${isSending ? "opacity-60" : ""} ${message.cancelled ? "opacity-40" : ""}`}
                  data-testid="message-investigation"
                >
                  <MessageContent content={message.content} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {message.cancelled && (
                    <span className="text-[10px] font-medium text-red-400/60 uppercase tracking-wider select-none">Cancelled</span>
                  )}
                  {ts && (
                    <span className={`text-[10px] text-text-muted tabular-nums select-none transition-opacity duration-150 ${isLast ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"}`}>
                      {ts}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          return (
            <ChatBubble
              key={message.id}
              role={message.role as "user" | "assistant"}
              timestamp={message.timestamp}
              showTimestamp={isLast ? "always" : "hover"}
              dimmed={isSending}
              cancelled={message.cancelled}
              actions={
                <>
                  {isSending && (
                    <p className="mt-1 text-caption text-text-tertiary">Sending...</p>
                  )}
                  {message.role === "assistant" && !isSending && !showSprintActions && (
                    <CopyActions content={message.content} />
                  )}
                  {showSprintActions && (
                    <>
                      <CopyActions content={message.content} />
                      <SprintGoalActions content={message.content} metadata={sprintGoalMeta} showToast={showToast!} />
                    </>
                  )}
                </>
              }
            >
              <MessageContent content={message.content} />
            </ChatBubble>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
