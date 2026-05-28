"use client";

import { useState, useEffect, useCallback } from "react";
import { settings as settingsApi } from "@/lib/api-client";
import { useDebouncedCallback } from "./useDebouncedCallback";

const DEBOUNCE_MS = 500;

export function useSectionVisibility(sectionId: string, defaultVisible: string[]) {
  const [visible, setVisible] = useState<Set<string>>(new Set(defaultVisible));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    settingsApi.getSectionVisibility(sectionId)
      .then((data) => {
        if (data.visible && data.visible.length > 0) {
          const stored = new Set(data.visible);
          // Fields in defaultVisible that aren't in the stored set AND weren't
          // previously known are new additions; default them to visible.
          const allKnown = new Set(data.allKnown ?? data.visible);
          for (const f of defaultVisible) {
            if (!allKnown.has(f)) stored.add(f);
          }
          setVisible(stored);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [sectionId]);

  const persist = useDebouncedCallback(
    (nextVisible: Set<string>) => {
      settingsApi.saveSectionVisibility(sectionId, [...nextVisible], defaultVisible)
        .catch((err) => console.warn("[section-visibility] persist failed", err));
    },
    DEBOUNCE_MS,
  );

  const toggleField = useCallback(
    (field: string, show: boolean) => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (show) next.add(field);
        else next.delete(field);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { visible, loaded, toggleField };
}
