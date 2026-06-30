"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useSWR from "swr";
import type { Message, Conversation } from "@/types/chat";
import { conversations as conversationsApi, swrFetcher } from "@/lib/api-client";
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

type ConversationWithMessages = Conversation & { messages?: Message[] };

// Stable empty reference so an idle render does not churn the merged list.
const EMPTY: Message[] = [];

export function useMessages(
  conversationId: string | null,
  options?: UseMessagesOptions,
): UseMessagesReturn {
  const hasRunningTask = options?.hasRunningTask ?? false;

  // Optimistic sends not yet present in the server payload. Kept out of the shared
  // SWR cache (which holds server truth) and merged at render time instead.
  const [pending, setPending] = useState<Message[]>([]);
  // Reset optimistic state when the conversation changes (adjust-state-during-render;
  // a setState-in-effect would be build-blocking under the React Compiler).
  const [trackedId, setTrackedId] = useState(conversationId);
  if (trackedId !== conversationId) {
    setTrackedId(conversationId);
    setPending(EMPTY);
  }

  const [actionError, setActionError] = useState<string | null>(null);

  // Last time we saw activity (entering a conversation, a send, or new server
  // messages). Drives the idle gate so a quiet conversation stops polling after
  // the idle window. Seeded to 0 (Date.now() is impure in render) and bumped by
  // the poll effect on mount/switch and by onSuccess when new messages arrive.
  const lastActivityRef = useRef<number>(0);
  const sigRef = useRef<string | null>(null);

  // The conversation detail (with its messages) is the canonical SWR entry shared
  // with prefetch and useRefinementStream's `mutate('/api/conversations/:id')`.
  // A null key means "don't fetch" (no conversation selected).
  const key = conversationId ? `/api/conversations/${conversationId}` : null;
  const { data, error: swrError, isLoading, mutate } = useSWR<ConversationWithMessages>(
    key,
    swrFetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      // Switching conversations clears to the new conversation immediately rather
      // than briefly showing the previous one's messages.
      keepPreviousData: false,
      shouldRetryOnError: false,
      // After a real server fetch, bump activity and drop optimistic messages the
      // server now confirms — but only when the payload changed. This runs in a
      // callback (not an effect), so setState is allowed under the React Compiler.
      onSuccess: (fetched) => {
        const msgs = fetched?.messages ?? EMPTY;
        const sig = `${msgs.length}:${msgs[msgs.length - 1]?.id ?? ""}`;
        if (sig === sigRef.current) return;
        sigRef.current = sig;
        lastActivityRef.current = Date.now();
        const serverIds = new Set(msgs.map((m) => m.id));
        setPending((prev) => {
          const next = prev.filter((m) => !serverIds.has(m.id));
          return next.length === prev.length ? prev : next;
        });
      },
    },
  );

  const serverMessages = data?.messages ?? EMPTY;

  // Adaptive poll: same idle gate as before, but driven through SWR's `mutate`
  // (so it shares the cache/dedupe). The timer always runs and skips the refetch
  // when idle or on a hidden tab, so it resumes automatically on the next activity
  // (mirrors usePipelines' single-source manual interval).
  useEffect(() => {
    if (!conversationId) return;
    // Entering a conversation counts as activity, so the idle window restarts.
    lastActivityRef.current = Date.now();

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const isActive =
        hasRunningTask || Date.now() - lastActivityRef.current < MESSAGE_POLL_IDLE_TIMEOUT_MS;
      if (!isActive) return;
      mutate();
    }, MESSAGE_POLL_MS);

    return () => clearInterval(id);
  }, [conversationId, hasRunningTask, mutate]);

  const messages = useMemo(() => {
    if (pending.length === 0) return serverMessages;
    const serverIds = new Set(serverMessages.map((m) => m.id));
    const stillPending = pending.filter((m) => !serverIds.has(m.id));
    return stillPending.length === 0 ? serverMessages : [...serverMessages, ...stillPending];
  }, [serverMessages, pending]);

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!conversationId) return false;
      setActionError(null);

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        workspaceTaskId: null,
      };
      setPending((prev) => [...prev, optimisticMessage]);
      lastActivityRef.current = Date.now();

      try {
        const savedMessage = await conversationsApi.sendMessage(conversationId, { role: "user", content });
        // Swap the optimistic entry for the saved one; it is pruned from `pending`
        // once a background refetch surfaces it in the server payload.
        setPending((prev) => prev.map((m) => (m.id === optimisticId ? savedMessage : m)));
        return true;
      } catch (err) {
        setPending((prev) => prev.filter((m) => m.id !== optimisticId));
        setActionError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [conversationId],
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const error = actionError ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null);

  return {
    messages,
    loading: isLoading,
    error,
    sendMessage,
    refresh,
  };
}
