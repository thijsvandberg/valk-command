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
          setVisible(new Set(data.visible));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [sectionId]);

  const persist = useDebouncedCallback(
    (nextVisible: Set<string>) => {
      settingsApi.saveSectionVisibility(sectionId, [...nextVisible])
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
