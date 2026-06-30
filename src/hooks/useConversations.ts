"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import type { Conversation, ConversationType } from "@/types/chat";
import { conversations as conversationsApi } from "@/lib/api-client";
import { CONVERSATION_LIST_POLL_MS } from "@/lib/polling-constants";

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  createConversation: (title?: string, type?: ConversationType) => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<boolean>;
  markAsRead: (id: string) => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  bulkAction: (ids: string[], action: "delete" | "markRead" | "markUnread") => Promise<void>;
  refresh: () => Promise<void>;
}

const CONVERSATIONS_KEY = "/api/conversations";
// Stable empty reference so consumers don't re-render while the list is loading.
const EMPTY: Conversation[] = [];

export function useConversations(): UseConversationsReturn {
  // SWR owns the list cache: it dedupes the two mounts (Chat + nav badge), pauses
  // on a hidden tab, and lives in the LRU-bounded provider. `dedupingInterval`
  // sits below the poll cadence so the background refresh is not suppressed by
  // the global 30s dedupe (mirrors useNotifications).
  const { data, error: swrError, isLoading, mutate } = useSWR<Conversation[]>(
    CONVERSATIONS_KEY,
    () => conversationsApi.list(),
    {
      refreshInterval: CONVERSATION_LIST_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: CONVERSATION_LIST_POLL_MS - 1000,
      shouldRetryOnError: false,
    },
  );

  // Mutation failures (create/delete) are not fetch errors, so SWR's `error`
  // does not surface them; track them locally and combine for the public field.
  const [actionError, setActionError] = useState<string | null>(null);

  const conversations = data ?? EMPTY;
  const error = actionError ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null);

  // Latest list, read by the read/unread handlers without widening their deps.
  // An optimistic mutate that lands while the initial fetch is in flight makes
  // SWR discard that fetch (stuck-empty list), so those handlers patch only when
  // the conversation is already loaded; the write still persists server-side.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const createConversation = useCallback(
    async (title?: string, type: ConversationType = "chat"): Promise<Conversation | null> => {
      setActionError(null);
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
        readAt: null,
      };
      mutate((prev) => [optimistic, ...(prev ?? [])], { revalidate: false });

      try {
        const conversation = await conversationsApi.create({ title: title || defaultTitle, type });
        await mutate(
          (prev) => (prev ?? []).map((c) => (c.id === optimisticId ? conversation : c)),
          { revalidate: false },
        );
        return conversation;
      } catch (err) {
        await mutate((prev) => (prev ?? []).filter((c) => c.id !== optimisticId), { revalidate: false });
        setActionError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [mutate],
  );

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      setActionError(null);
      // Optimistic removal; not rolled back on failure (matches prior behaviour —
      // the next background poll re-adds it if the server still has it).
      mutate((prev) => (prev ?? []).filter((c) => c.id !== id), { revalidate: false });
      try {
        await conversationsApi.delete(id);
        return true;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [mutate],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const current = dataRef.current;
      if (current?.some((c) => c.id === id)) {
        const now = new Date().toISOString();
        mutate(current.map((c) => (c.id === id ? { ...c, readAt: now } : c)), { revalidate: false });
      }
      try {
        await conversationsApi.markRead(id);
      } catch {
        mutate(); // revert to server truth
      }
    },
    [mutate],
  );

  const markAsUnread = useCallback(
    async (id: string) => {
      const current = dataRef.current;
      if (current?.some((c) => c.id === id)) {
        mutate(current.map((c) => (c.id === id ? { ...c, readAt: null } : c)), { revalidate: false });
      }
      try {
        await conversationsApi.markUnread(id);
      } catch {
        mutate();
      }
    },
    [mutate],
  );

  const bulkAction = useCallback(
    async (ids: string[], action: "delete" | "markRead" | "markUnread") => {
      if (action === "delete") {
        mutate((prev) => (prev ?? []).filter((c) => !ids.includes(c.id)), { revalidate: false });
      } else if (action === "markRead") {
        const now = new Date().toISOString();
        mutate(
          (prev) => (prev ?? []).map((c) => (ids.includes(c.id) ? { ...c, readAt: now } : c)),
          { revalidate: false },
        );
      } else {
        mutate(
          (prev) => (prev ?? []).map((c) => (ids.includes(c.id) ? { ...c, readAt: null } : c)),
          { revalidate: false },
        );
      }
      try {
        await conversationsApi.bulk({ ids, action });
      } catch {
        mutate();
      }
    },
    [mutate],
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    conversations,
    loading: isLoading,
    error,
    createConversation,
    deleteConversation,
    markAsRead,
    markAsUnread,
    bulkAction,
    refresh,
  };
}
