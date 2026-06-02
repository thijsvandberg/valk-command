"use client";

import { useState, useEffect, useCallback } from "react";
import type { InlineTagId } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE_TAGS, columnsToTags, isTagVisibility } from "@/components/sprint-board/FilterBar";
import { settings as settingsApi } from "@/lib/api-client";
import { useDebouncedCallback } from "./useDebouncedCallback";

const DEBOUNCE_MS = 500;

// One-time correction: an earlier migration wrongly dropped PO readiness for existing
// users. Re-add it once, then respect the user's toggle choice afterwards (BRDG-239).
const POREADINESS_FIX_KEY = "sprint-board-poreadiness-default-fix";

// Headerless board (BRDG-239): persists only inline tag visibility. Column ordering
// and fixed widths were removed with the table. Legacy persisted column-visibility
// sets are migrated to the tag set on first load.
export function useColumnConfig() {
  const [visible, setVisible] = useState<Set<InlineTagId>>(new Set(DEFAULT_VISIBLE_TAGS));
  const [loaded, setLoaded] = useState(false);

  const persist = useDebouncedCallback((nextVisible: Set<InlineTagId>) => {
    settingsApi.saveColumnConfig({ order: [], visible: [...nextVisible] })
      .catch((err) => console.warn("[column-config] persist failed", err));
  }, DEBOUNCE_MS);

  useEffect(() => {
    const fixApplied = typeof window !== "undefined" && localStorage.getItem(POREADINESS_FIX_KEY) === "true";
    settingsApi.getColumnConfig()
      .then((raw) => raw as { order: string[] | null; visible: string[] | null })
      .then((data) => {
        let next: Set<InlineTagId> | null = null;
        let needsPersist = false;
        if (data.visible && data.visible.length > 0) {
          if (isTagVisibility(data.visible)) {
            next = new Set(data.visible as InlineTagId[]);
          } else {
            // Legacy column-visibility set -> migrate to tags and persist once.
            next = new Set(columnsToTags(data.visible));
            needsPersist = true;
          }
        }
        // One-time PO readiness correction (see POREADINESS_FIX_KEY).
        if (!fixApplied) {
          if (next && !next.has("poReadiness")) { next.add("poReadiness"); needsPersist = true; }
          if (typeof window !== "undefined") localStorage.setItem(POREADINESS_FIX_KEY, "true");
        }
        if (next) {
          setVisible(next);
          if (needsPersist) {
            settingsApi.saveColumnConfig({ order: [], visible: [...next] })
              .catch((err) => console.warn("[column-config] persist failed", err));
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggleColumn = useCallback((id: InlineTagId, show: boolean) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      persist(next);
      return next;
    });
  }, [persist]);

  const applyVisible = useCallback((tags: InlineTagId[]) => {
    const next = new Set(tags);
    setVisible(next);
    persist(next);
  }, [persist]);

  const resetToDefaults = useCallback(() => {
    applyVisible(DEFAULT_VISIBLE_TAGS);
  }, [applyVisible]);

  return { visible, loaded, toggleColumn, applyVisible, resetToDefaults };
}
