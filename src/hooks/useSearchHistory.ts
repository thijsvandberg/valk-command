"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

const HISTORY_KEY = "search_history";
const MAX_HISTORY = 5;
const MIN_QUERY_LENGTH = 2;

interface UseSearchHistory {
  history: string[];
  addSearch: (query: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistory {
  const [history, setHistory] = useLocalStorage<string[]>(HISTORY_KEY, []);

  const addSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return;
      setHistory((prev) => {
        // Remove duplicate then prepend, cap at max
        const deduped = prev.filter((q) => q !== trimmed);
        return [trimmed, ...deduped].slice(0, MAX_HISTORY);
      });
    },
    [setHistory],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return { history, addSearch, clearHistory };
}
