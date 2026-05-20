"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { settings as settingsApi } from "@/lib/api-client";

export type ColumnWidths = Record<string, number>;

const DEBOUNCE_MS = 500;

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  type: 32,
  key: 96,
  title: 360,
  epic: 180,
  jiraStatus: 112,
  sprint: 144,
  points: 48,
  assignee: 40,
  flagged: 32,
  poStatus: 40,
  quality: 64,
  bv: 40,
  notes: 32,
  pipeline: 96,
};

export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    settingsApi.getColumnWidths()
      .then((data) => {
        setWidths(data.widths);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: ColumnWidths) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      settingsApi.saveColumnWidths(next)
        .catch((err) => console.warn("[column-widths] persist failed", err));
    }, DEBOUNCE_MS);
  }, []);

  const setColumnWidth = useCallback((colId: string, width: number) => {
    setWidths((prev) => {
      const next = { ...prev, [colId]: width };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetColumnWidth = useCallback((colId: string) => {
    setWidths((prev) => {
      const next = { ...prev };
      delete next[colId];
      persist(next);
      return next;
    });
  }, [persist]);

  const getWidth = useCallback((colId: string): number | undefined => {
    return widths[colId] ?? undefined;
  }, [widths]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return { widths, loaded, getWidth, setColumnWidth, resetColumnWidth };
}
