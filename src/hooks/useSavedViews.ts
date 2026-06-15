"use client";

import { useEffect, useRef } from "react";
import type { SavedView } from "@/components/sprint-board/FilterBar";
import { useAccountSetting } from "@/hooks/useAccountSetting";

const SAVED_VIEWS_URL = "/api/settings/saved-views";

// The original browser-local key (BRDG-343 migrated saved views to the account).
const LEGACY_LOCAL_KEY = "sprint-board-saved-views";
const MIGRATED_FLAG = "sprint-board-saved-views-migrated";

// Stable empty default so the SWR fallback never triggers a re-render loop.
const EMPTY_VIEWS: SavedView[] = [];

/**
 * Account-scoped saved sprint-board views. Returns the same [value, setValue]
 * shape the board previously got from useLocalStorage, so the call site swap is
 * minimal. On first load it performs a one-time, idempotent import of any views
 * left in this browser's localStorage, merging by id so nothing is lost and the
 * import never runs twice.
 */
export function useSavedViews(): {
  savedViews: SavedView[];
  setSavedViews: (next: SavedView[] | ((prev: SavedView[]) => SavedView[])) => void;
  isLoading: boolean;
} {
  const { value, setValue, isLoading } = useAccountSetting<SavedView[]>(
    SAVED_VIEWS_URL,
    EMPTY_VIEWS,
  );

  const migratedRef = useRef(false);
  useEffect(() => {
    if (isLoading || migratedRef.current) return;
    migratedRef.current = true;
    try {
      if (localStorage.getItem(MIGRATED_FLAG) === "1") return;
      const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
      const localViews: SavedView[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(localViews) && localViews.length > 0) {
        setValue((prev) => {
          const existing = new Set(prev.map((v) => v.id));
          return [...prev, ...localViews.filter((v) => v && !existing.has(v.id))];
        });
      }
      localStorage.setItem(MIGRATED_FLAG, "1");
    } catch {
      // localStorage unavailable or corrupt: nothing to migrate.
    }
  }, [isLoading, setValue]);

  return { savedViews: value, setSavedViews: setValue, isLoading };
}
