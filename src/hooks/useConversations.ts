"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Conversation, ConversationType } from "@/types/chat";
import { conversations as conversationsApi, ApiError } from "@/lib/api-client";
import { CONVERSATION_LIST_POLL_MS } from "@/lib/polling-constants";

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
  const lastJsonRef = useRef<string>("");

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsApi.list();
      const json = JSON.stringify(data);
      lastJsonRef.current = json;
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

  // Background polling: silently refresh conversation list without loading state
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await conversationsApi.list();
        const json = JSON.stringify(data);
        if (json !== lastJsonRef.current) {
          lastJsonRef.current = json;
          setConversations(data);
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    const interval = setInterval(poll, CONVERSATION_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, []);

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
        metadata: null,
        pinned: false,
      };
      setConversations((prev) => [optimistic, ...prev]);

      try {
        const conversation = await conversationsApi.create({ title: title || defaultTitle, type });
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
        await conversationsApi.delete(id);
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
