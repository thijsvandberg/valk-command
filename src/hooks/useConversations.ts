"use client";

import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "@/types/chat";

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  createConversation: (title?: string) => Promise<Conversation | null>;
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
    async (title?: string): Promise<Conversation | null> => {
      setError(null);
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        const conversation: Conversation = await res.json();
        setConversations((prev) => [conversation, ...prev]);
        return conversation;
      } catch (err) {
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
