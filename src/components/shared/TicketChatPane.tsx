"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { ChatBubble } from "@/components/shared/ChatBubble";
import { ChatInput } from "@/components/shared/ChatInput";
import { LoadingState } from "@/components/shared/LoadingState";
import { StreamingIndicator } from "@/components/shared/StreamingIndicator";
import { apiFetch } from "@/lib/api-client";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { X, Sparkles, MessageSquareText } from "lucide-react";

interface TicketChatPaneProps {
  ticketKey: string;
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

export function TicketChatPane({ ticketKey, onClose }: TicketChatPaneProps) {
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
        <PaneHeader onClose={onClose} />
        <LoadingState label="Loading chat..." />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex h-full flex-col">
        <PaneHeader onClose={onClose} />
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-body-sm text-red-400">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeader onClose={onClose} isStreaming={isTaskRunning} />

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
        compact
        placeholder="Ask about this ticket..."
        ariaLabel="Ticket chat input"
        sendAriaLabel="Send ticket chat message"
        testId="ticket-chat-input"
      />
    </div>
  );
}

function PaneHeader({ onClose, isStreaming }: {
  onClose?: () => void;
  isStreaming?: boolean;
}) {
  // Mirror the ticket tab bar exactly (border on the wrapper, h-[44px] inner
  // row) so the bottom border lines up in both height and color.
  return (
    <div className="shrink-0 border-b border-border-default">
      <div className="flex h-[44px] items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <div className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/[0.1] border border-[var(--color-brand-500)]/[0.18]">
            <MessageSquareText size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            {isStreaming && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[var(--color-brand-400)] ring-2 ring-surface-elevated animate-pulse" />
            )}
          </div>
          <span className="text-body-sm font-medium text-text-primary">Chat</span>
          {isStreaming && (
            <span className="text-caption font-medium uppercase tracking-label text-text-muted">thinking</span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 cursor-pointer text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
