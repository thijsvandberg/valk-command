import { useState, useCallback } from "react";

// Device-local (BRDG-343): ephemeral recent-commands list; low value to sync.
const STORAGE_KEY = "slash-commands-recent";
const MAX_RECENT = 5;

export function useRecentCommands() {
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  const trackUsage = useCallback((commandId: string) => {
    setRecentIds((prev) => {
      const next = [commandId, ...prev.filter((id) => id !== commandId)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  return { recentIds, trackUsage };
}
