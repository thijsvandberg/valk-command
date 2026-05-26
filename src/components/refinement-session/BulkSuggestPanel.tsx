"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMessages } from "@/hooks/useMessages";
import { ChatBubble } from "@/components/shared/ChatBubble";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { ComponentProps } from "react";

interface BulkSuggestPanelProps {
  conversationId: string;
  isRunning: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function TicketLink({ href, children, ...rest }: ComponentProps<"a">) {
  if (href?.startsWith("/tickets/")) {
    return (
      <Link
        href={href}
        className="font-medium text-[var(--color-brand-500)] hover:text-[var(--color-brand-400)] hover:underline"
        style={{ transition: "color 0.15s ease" }}
      >
        {children}
      </Link>
    );
  }
  return <a href={href} {...rest}>{children}</a>;
}

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ a: TicketLink }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function BulkSuggestPanel({
  conversationId,
  isRunning,
  collapsed,
  onToggleCollapse,
}: BulkSuggestPanelProps) {
  const { messages } = useMessages(conversationId, { hasRunningTask: isRunning });

  // Only show assistant messages (the progress log)
  const progressMessages = messages.filter((m) => m.role === "assistant");

  // Auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    if (progressMessages.length > prevCountRef.current && wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = progressMessages.length;
  }, [progressMessages.length]);

  const lastMsg = progressMessages[progressMessages.length - 1];
  const isComplete = lastMsg?.content.startsWith("Bulk suggestion complete");

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease" }}
      >
        {collapsed ? (
          <ChevronRight size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
        )}
        <span className="text-xs font-semibold tracking-tight text-text-secondary">
          Subtask generation log
        </span>
        {isRunning && (
          <Loader2 size={11} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
        )}
        {!isRunning && isComplete && (
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            Done
          </span>
        )}
        <span className="ml-auto text-[10px] tabular-nums text-text-muted">
          {progressMessages.length} message{progressMessages.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Collapsible message list */}
      {!collapsed && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="max-h-[240px] overflow-y-auto border-t border-border-subtle px-3 py-2 space-y-2"
          style={{ scrollbarWidth: "thin" }}
        >
          {progressMessages.length === 0 && isRunning && (
            <div className="flex items-center gap-2 py-3">
              <Loader2 size={12} className="animate-spin text-[var(--color-brand-400)]" />
              <span className="text-xs text-text-muted">Starting...</span>
            </div>
          )}

          {progressMessages.map((msg) => (
            <div
              key={msg.id}
              className="text-xs leading-relaxed text-text-secondary [&_p]:m-0"
            >
              <MessageContent content={msg.content} />
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
