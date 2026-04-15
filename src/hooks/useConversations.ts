"use client";

import { useState, useEffect, useCallback } from "react";
import type { Conversation, ConversationType } from "@/types/chat";

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  createConversation: (title?: string, type?: ConversationType) => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = useCallback(
    async (title?: string, type: ConversationType = "chat"): Promise<Conversation | null> => {
      setError(null);
      const optimisticId = `optimistic-${Date.now()}`;
      const defaultTitle = type === "investigation" ? "New investigation" : "New conversation";
      const optimistic: Conversation = {
        id: optimisticId,
        title: title || defaultTitle,
        type,
        createdAt: new Date().toISOString(),
        relatedTicket: null,
      };
      setConversations((prev) => [optimistic, ...prev]);

      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || defaultTitle, type }),
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        const conversation: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === optimisticId ? conversation : c))
        );
        return conversation;
      } catch (err) {
        setConversations((prev) => prev.filter((c) => c.id !== optimisticId));
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    []
  );

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      // Optimistic removal
      setConversations((prev) => prev.filter((c) => c.id !== id));
      try {
        const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (!res.ok) {
          await fetchConversations();
          throw new Error("Failed to delete conversation");
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [fetchConversations]
  );

  return {
    conversations,
    loading,
    error,
    createConversation,
    deleteConversation,
    refresh: fetchConversations,
  };
}
