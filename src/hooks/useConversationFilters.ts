"use client";

import { useMemo, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Conversation } from "@/types/chat";
import {
  deriveCategory,
  ALL_CATEGORIES,
  type ConversationCategory,
} from "@/lib/conversation-category";

interface UseConversationFiltersReturn {
  activeFilters: Set<ConversationCategory>;
  toggleFilter: (category: ConversationCategory) => void;
  clearFilters: () => void;
  categoryCounts: Record<ConversationCategory, number>;
  filteredConversations: Conversation[];
}

export function useConversationFilters(
  conversations: Conversation[],
): UseConversationFiltersReturn {
  const [storedFilters, setStoredFilters] = useLocalStorage<ConversationCategory[]>(
    "bridge:chat-filters",
    [],
  );

  const activeFilters = useMemo(() => new Set(storedFilters), [storedFilters]);

  const toggleFilter = useCallback(
    (category: ConversationCategory) => {
      setStoredFilters((prev) => {
        const set = new Set(prev);
        if (set.has(category)) {
          set.delete(category);
        } else {
          set.add(category);
        }
        return Array.from(set);
      });
    },
    [setStoredFilters],
  );

  const clearFilters = useCallback(() => {
    setStoredFilters([]);
  }, [setStoredFilters]);

  const conversationsWithCategory = useMemo(
    () => conversations.map((c) => ({ conversation: c, category: deriveCategory(c) })),
    [conversations],
  );

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<ConversationCategory, number>;
    for (const cat of ALL_CATEGORIES) counts[cat] = 0;
    for (const { category } of conversationsWithCategory) {
      counts[category]++;
    }
    return counts;
  }, [conversationsWithCategory]);

  const filteredConversations = useMemo(() => {
    if (activeFilters.size === 0) return conversations;
    return conversationsWithCategory
      .filter(({ category }) => activeFilters.has(category))
      .map(({ conversation }) => conversation);
  }, [conversations, conversationsWithCategory, activeFilters]);

  return {
    activeFilters,
    toggleFilter,
    clearFilters,
    categoryCounts,
    filteredConversations,
  };
}
