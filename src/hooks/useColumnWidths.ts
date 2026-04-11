"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ColumnWidths = Record<string, number>;

const DEBOUNCE_MS = 500;

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  type: 32,
  key: 96,
  title: 0,    // flex column, no fixed width
  epic: 144,
  jiraStatus: 112,
  sprint: 144,
  points: 48,
  assignee: 40,
  flagged: 32,
  poStatus: 40,
  quality: 64,
  notes: 32,
  pipeline: 72,
};

export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings/column-widths")
      .then((r) => r.ok ? r.json() : { widths: {} })
      .then((data: { widths: ColumnWidths }) => {
        setWidths(data.widths);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: ColumnWidths) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/settings/column-widths", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widths: next }),
      }).catch(() => {});
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
