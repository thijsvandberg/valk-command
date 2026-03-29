"use client";

import { useState, useEffect, useCallback } from "react";
import type { Message } from "@/types/chat";

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useMessages(conversationId: string | null): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

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

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content }),
        });
        if (!res.ok) throw new Error("Failed to send message");
        const savedMessage: Message = await res.json();

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
