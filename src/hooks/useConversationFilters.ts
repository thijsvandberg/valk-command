"use client";

import { useMemo, useCallback } from "react";
import { useMigratedAccountSetting } from "./useMigratedAccountSetting";
import type { Conversation } from "@/types/chat";
import {
  deriveCategory,
  ALL_CATEGORIES,
  type ConversationCategory,
} from "@/lib/conversation-category";

// Stable default so the account-setting SWR fallback never churns identity.
const EMPTY_FILTERS: ConversationCategory[] = [];

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
  const { value: storedFilters, setValue: setStoredFilters } =
    useMigratedAccountSetting<ConversationCategory[]>(
      "/api/settings/chat-filters",
      "bridge:chat-filters",
      EMPTY_FILTERS,
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

  // A loading/empty fetch can hand us null before the list resolves; treat it as empty.
  const safeConversations = useMemo(() => conversations ?? [], [conversations]);

  const conversationsWithCategory = useMemo(
    () => safeConversations.map((c) => ({ conversation: c, category: deriveCategory(c) })),
    [safeConversations],
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
    if (activeFilters.size === 0) return safeConversations;
    return conversationsWithCategory
      .filter(({ category }) => activeFilters.has(category))
      .map(({ conversation }) => conversation);
  }, [safeConversations, conversationsWithCategory, activeFilters]);

  return {
    activeFilters,
    toggleFilter,
    clearFilters,
    categoryCounts,
    filteredConversations,
  };
}
