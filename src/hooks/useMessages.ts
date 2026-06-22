"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Message, Conversation } from "@/types/chat";
import { conversations as conversationsApi } from "@/lib/api-client";
import { MESSAGE_POLL_MS, MESSAGE_POLL_IDLE_TIMEOUT_MS } from "@/lib/polling-constants";

interface UseMessagesOptions {
  hasRunningTask?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useMessages(
  conversationId: string | null,
  options?: UseMessagesOptions,
): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsApi.get(conversationId) as Conversation & { messages?: Message[] };
      setMessages(data.messages ?? []);
      lastActivityRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Self-contained initial fetch with an ignore guard. fetchMessages is exposed as `refresh`,
  // so the guard lives in the effect (not the callback): switching conversations fast must not
  // let an old response overwrite with the previous conversation's messages.
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await conversationsApi.get(conversationId) as Conversation & { messages?: Message[] };
        if (!ignore) {
          setMessages(data.messages ?? []);
          lastActivityRef.current = Date.now();
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [conversationId]);

  // Background polling for new messages
  const hasRunningTask = options?.hasRunningTask ?? false;
  useEffect(() => {
    if (!conversationId) return;

    const poll = async () => {
      const isActive = hasRunningTask || Date.now() - lastActivityRef.current < MESSAGE_POLL_IDLE_TIMEOUT_MS;
      if (!isActive) return;

      try {
        const data = await conversationsApi.get(conversationId) as Conversation & { messages?: Message[] };
        const newMessages = data.messages ?? [];

        setMessages((prev) => {
          // Filter out optimistic messages for comparison
          const confirmed = prev.filter((m) => !m.id.startsWith("optimistic-"));
          if (
            confirmed.length === newMessages.length &&
            confirmed[confirmed.length - 1]?.id === newMessages[newMessages.length - 1]?.id
          ) {
            return prev;
          }

          // Keep optimistic messages that aren't yet confirmed
          const serverIds = new Set(newMessages.map((m) => m.id));
          const pendingOptimistic = prev.filter(
            (m) => m.id.startsWith("optimistic-") && !serverIds.has(m.id),
          );
          lastActivityRef.current = Date.now();
          return [...newMessages, ...pendingOptimistic];
        });
      } catch {
        // Silently ignore poll errors
      }
    };

    const interval = setInterval(poll, MESSAGE_POLL_MS);
    return () => clearInterval(interval);
  }, [conversationId, hasRunningTask]);

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!conversationId) return false;
      setError(null);

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        workspaceTaskId: null,
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      lastActivityRef.current = Date.now();

      try {
        const savedMessage = await conversationsApi.sendMessage(conversationId, { role: "user", content });

        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? savedMessage : m))
        );
        return true;
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [conversationId]
  );

  return {
    messages,
    loading,
    error,
    sendMessage,
    refresh: fetchMessages,
  };
}
