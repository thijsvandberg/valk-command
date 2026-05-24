"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { ChatBubble } from "@/components/shared/ChatBubble";
import { ChatInput } from "@/components/shared/ChatInput";
import { LoadingState } from "@/components/shared/LoadingState";
import { apiFetch } from "@/lib/api-client";
import { MessageSquareText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TicketChatPaneProps {
  ticketKey: string;
  ticketTitle: string;
  onClose?: () => void;
}

function CompactTaskProgress({ status, progressText, error }: {
  status: string;
  progressText: string;
  error: string | null;
}) {
  if (status === "idle" || status === "completed") return null;

  if (status === "failed") {
    return (
      <div className="px-4 py-2 border-t border-red-500/20">
        <span className="text-xs text-red-400">{error ?? "Task failed"}</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-t border-border-default">
      <div className="flex items-center gap-2">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-40" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-brand-400)]" />
        </span>
        <span className="text-xs text-text-secondary truncate">
          {progressText || "Working..."}
        </span>
      </div>
    </div>
  );
}

function CompactMessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {content.replace(/<\/?story-draft>/g, "").replace(/<br\s*\/?>/gi, "\n").trim()}
    </ReactMarkdown>
  );
}

function ContextMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border-subtle bg-overlay-subtle px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-xs text-text-muted hover:text-text-secondary"
        style={{ transition: "color 0.15s ease" }}
      >
        <MessageSquareText size={12} strokeWidth={1.5} />
        <span className="font-medium">Ticket context</span>
        <span className="ml-auto text-[10px]">{expanded ? "Collapse" : "Expand"}</span>
      </button>
      {expanded && (
        <div className="mt-2 max-h-48 overflow-y-auto border-t border-border-subtle pt-2 text-xs text-text-tertiary leading-relaxed prose-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function TicketChatPane({ ticketKey, ticketTitle, onClose }: TicketChatPaneProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  // Find or create conversation for this ticket
  useEffect(() => {
    if (prevKeyRef.current === ticketKey && conversationId) return;
    prevKeyRef.current = ticketKey;

    let cancelled = false;
    setInitializing(true); // eslint-disable-line react-hooks/set-state-in-effect -- reset on key change
    setInitError(null); // eslint-disable-line react-hooks/set-state-in-effect
    setConversationId(null); // eslint-disable-line react-hooks/set-state-in-effect

    apiFetch<{ id: string }>(`/api/tickets/${encodeURIComponent(ticketKey)}/chat`, {
      method: "POST",
    })
      .then((conv) => {
        if (!cancelled) {
          setConversationId(conv.id);
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
  }, [ticketKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const workspaceTask = useWorkspaceTask(conversationId ?? undefined);
  const isTaskRunning = workspaceTask.status === "streaming" || workspaceTask.status === "submitting";

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

  // Refresh messages when task completes
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
        workspaceTask.reset();
        await workspaceTask.submitAndStream("chat", { args: content.trim() }, conversationId);
      }

      return true;
    },
    [conversationId, sendMessage, workspaceTask, messages],
  );

  // Separate context message (sequence 0) from chat messages
  const contextMessage = messages.find((m) => m.sequence === 0 && m.role === "user");
  const chatMessages = messages.filter((m) => m !== contextMessage);

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
          <p className="text-xs text-red-400">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeader ticketKey={ticketKey} ticketTitle={ticketTitle} onClose={onClose} />

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {contextMessage && (
          <ContextMessage content={contextMessage.content} />
        )}

        {chatMessages.length === 0 && !msgLoading && (
          <p className="text-center text-xs text-text-muted py-8">
            Ask a question about this ticket to start.
          </p>
        )}

        {chatMessages.map((msg, idx) => {
          const isSending = msg.id.startsWith("optimistic-");
          const isLast = idx === chatMessages.length - 1;

          return (
            <ChatBubble
              key={msg.id}
              role={msg.role as "user" | "assistant"}
              timestamp={msg.timestamp}
              showTimestamp={isLast ? "always" : "hover"}
              dimmed={isSending}
              className="!max-w-[90%] !text-xs"
            >
              <CompactMessageContent content={msg.content} />
            </ChatBubble>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Task progress */}
      <CompactTaskProgress
        status={workspaceTask.status}
        progressText={workspaceTask.progressText}
        error={workspaceTask.error}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isTaskRunning}
        placeholder="Ask about this ticket..."
        ariaLabel="Ticket chat input"
        sendAriaLabel="Send ticket chat message"
        testId="ticket-chat-input"
      />
    </div>
  );
}

function PaneHeader({ ticketKey, ticketTitle, onClose }: {
  ticketKey: string;
  ticketTitle: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
      <MessageSquareText size={14} strokeWidth={1.5} className="shrink-0 text-[#a78bfa]" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">
          {ticketKey}
        </span>
        <span className="block truncate text-[10px] text-text-muted leading-tight">
          {ticketTitle}
        </span>
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
  );
}
