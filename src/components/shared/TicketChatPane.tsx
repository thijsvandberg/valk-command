"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { ChatBubble } from "@/components/shared/ChatBubble";
import { ChatInput } from "@/components/shared/ChatInput";
import { LoadingState } from "@/components/shared/LoadingState";
import { StreamingIndicator } from "@/components/shared/StreamingIndicator";
import { apiFetch } from "@/lib/api-client";
import { Tooltip } from "@/components/shared/Tooltip";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { MessageSquareText, X, Sparkles, PenLine } from "lucide-react";

interface TicketChatPaneProps {
  ticketKey: string;
  ticketTitle: string;
  onClose?: () => void;
}

interface ChatConversation {
  id: string;
  ticketContext?: string;
}

function CompactMessageContent({ content }: { content: string }) {
  const cleaned = content.replace(/<\/?story-draft>/g, "").replace(/<br\s*\/?>/gi, "\n").trim();
  return (
    <div className="description-content chat-markdown">
      {renderMarkdown(cleaned, { linkifyRefs: true })}
    </div>
  );
}

export function TicketChatPane({ ticketKey, ticketTitle, onClose }: TicketChatPaneProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [ticketContext, setTicketContext] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Find or create conversation for this ticket.
  // The effect resets local state before the async call; the React compiler flags this
  // as "setState in effect" but it is the correct pattern for async initialization keyed
  // on a prop change. Suppressing until the component is refactored to use key-based reset.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    setInitError(null);
    setConversationId(null);

    apiFetch<ChatConversation>(`/api/tickets/${encodeURIComponent(ticketKey)}/chat`, {
      method: "POST",
    })
      .then((conv) => {
        if (!cancelled) {
          setConversationId(conv.id);
          setTicketContext(conv.ticketContext ?? null);
          setInitializing(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : "Failed to load chat");
          setInitializing(false);
        }
      });

    return () => { cancelled = true; };
  }, [ticketKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const workspaceTask = useWorkspaceTask(conversationId ?? undefined);
  const isStreaming = workspaceTask.status === "streaming";
  const isSubmitting = workspaceTask.status === "submitting";
  const isTaskRunning = isStreaming || isSubmitting;

  const {
    messages,
    loading: msgLoading,
    sendMessage,
    refresh: refreshMessages,
  } = useMessages(conversationId, { hasRunningTask: isTaskRunning });

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
    if (messages.length > prevCountRef.current && wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    if (prevCountRef.current === 0 && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // Refresh messages when task completes (same as ChatLayout)
  const notifiedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      workspaceTask.status !== "completed" ||
      !workspaceTask.taskId ||
      notifiedTaskRef.current === workspaceTask.taskId
    ) return;
    notifiedTaskRef.current = workspaceTask.taskId;
    refreshMessages();
  }, [workspaceTask.status, workspaceTask.taskId, refreshMessages]);

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      if (!conversationId) return false;

      const saved = await sendMessage(content);
      if (!saved) return false;

      const hasAssistantMessage = messages.some((m) => m.role === "assistant");

      if (hasAssistantMessage) {
        // Follow-up: resume existing workspace session (same as ChatLayout)
        try {
          workspaceTask.reset();
          const res = await apiFetch<{ id: string }>(`/api/conversations/${conversationId}/chat-messages`, {
            method: "POST",
            body: { content: content.trim() },
          });
          workspaceTask.streamExistingTask(res.id, "chat");
        } catch (err) {
          workspaceTask.reset();
          console.warn("[ticket-chat] follow-up failed", err);
        }
      } else {
        // First message: include ticket context in the args so the workspace knows about the ticket
        const contextPrefix = ticketContext
          ? `[Ticket context for ${ticketKey}]\n${ticketContext}\n\n[User question]\n`
          : "";
        workspaceTask.reset();
        await workspaceTask.submitAndStream(
          "chat",
          { args: `${contextPrefix}${content.trim()}` },
          conversationId,
        );
      }

      return true;
    },
    [conversationId, sendMessage, workspaceTask, messages, ticketContext, ticketKey],
  );

  if (initializing) {
    return (
      <div className="flex h-full flex-col">
        <PaneHeader ticketKey={ticketKey} ticketTitle={ticketTitle} onClose={onClose} />
        <LoadingState label="Loading chat..." />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex h-full flex-col">
        <PaneHeader ticketKey={ticketKey} ticketTitle={ticketTitle} onClose={onClose} />
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-body-sm text-red-400">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeader ticketKey={ticketKey} ticketTitle={ticketTitle} onClose={onClose} isStreaming={isTaskRunning} />

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && !msgLoading && !isTaskRunning && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-brand-500)]/[0.08] border border-[var(--color-brand-500)]/[0.12]">
              <Sparkles size={18} className="text-[var(--color-brand-400)] opacity-60" strokeWidth={1.5} />
            </div>
            <p className="text-body-sm text-text-muted text-center max-w-[200px]">
              Ask a question about this ticket
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isSending = msg.id.startsWith("optimistic-");
          const isLast = idx === messages.length - 1;

          return (
            <ChatBubble
              key={msg.id}
              role={msg.role as "user" | "assistant"}
              timestamp={msg.timestamp}
              showTimestamp={isLast ? "always" : "hover"}
              dimmed={isSending}
            >
              <CompactMessageContent content={msg.content} />
            </ChatBubble>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Streaming progress (same visual as Story Writer) */}
      {isTaskRunning && (
        <div className="border-t border-border-default px-4 py-2.5">
          <StreamingIndicator
            text={workspaceTask.progressText?.slice(0, 80) || (isSubmitting ? "Starting..." : "Working...")}
            className="pl-[34px]"
          />
        </div>
      )}

      {workspaceTask.status === "failed" && workspaceTask.error && (
        <div className="border-t border-red-500/20 px-4 py-2">
          <span className="text-body-sm text-red-400">{workspaceTask.error}</span>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isTaskRunning}
        resizable
        placeholder="Ask about this ticket..."
        ariaLabel="Ticket chat input"
        sendAriaLabel="Send ticket chat message"
        testId="ticket-chat-input"
      />
    </div>
  );
}

function PaneHeader({ ticketKey, ticketTitle, onClose, isStreaming }: {
  ticketKey: string;
  ticketTitle: string;
  onClose?: () => void;
  isStreaming?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
      <div className="relative">
        <MessageSquareText size={14} strokeWidth={1.5} className="shrink-0 text-[#a78bfa]" />
        {isStreaming && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium text-text-primary">
          {ticketKey}
        </span>
        <span className="block truncate text-[10px] text-text-muted leading-tight">
          {ticketTitle}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip content="Open in Story Writer">
          <a
            href={`/tickets/${encodeURIComponent(ticketKey)}/write`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
            aria-label="Open in Story Writer"
          >
            <PenLine size={14} strokeWidth={1.5} />
          </a>
        </Tooltip>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 cursor-pointer text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            aria-label="Close chat"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
