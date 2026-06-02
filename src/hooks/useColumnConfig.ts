"use client";

import { useState, useEffect, useCallback } from "react";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE, COLUMNS } from "@/components/sprint-board/FilterBar";
import { settings as settingsApi } from "@/lib/api-client";
import { useDebouncedCallback } from "./useDebouncedCallback";

const DEBOUNCE_MS = 500;

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);

// One-time migration (BRDG-251): the pipeline column's health/deploy badges
// moved into the ticket hover card, so the column is now default-hidden. Drop
// it once from any previously persisted visible set. Re-adding it via the
// column toggle still works and is not undone.
const PIPELINE_MIGRATION_KEY = "sprint-board-pipeline-col-migrated";

export function useColumnConfig() {
  const [order, setOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    settingsApi.getColumnConfig()
      .then((raw) => raw as { order: string[] | null; visible: string[] | null })
      .then((data) => {
        let nextOrder = DEFAULT_ORDER;
        if (data.order && data.order.length > 0) {
          // Merge: keep saved order, append any new columns not yet in the saved order
          const savedSet = new Set(data.order);
          nextOrder = [
            ...data.order.filter((id) => DEFAULT_ORDER.includes(id as ColumnId)),
            ...DEFAULT_ORDER.filter((id) => !savedSet.has(id)),
          ] as ColumnId[];
          setOrder(nextOrder);
        }
        if (data.visible && data.visible.length > 0) {
          let nextVisible = data.visible as ColumnId[];
          const alreadyMigrated = typeof window !== "undefined" && localStorage.getItem(PIPELINE_MIGRATION_KEY) === "true";
          if (!alreadyMigrated) {
            if (nextVisible.includes("pipeline")) {
              nextVisible = nextVisible.filter((id) => id !== "pipeline");
              settingsApi.saveColumnConfig({ order: nextOrder, visible: nextVisible })
                .catch((err) => console.warn("[column-config] pipeline migration persist failed", err));
            }
            if (typeof window !== "undefined") localStorage.setItem(PIPELINE_MIGRATION_KEY, "true");
          }
          setVisible(new Set(nextVisible));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const persist = useDebouncedCallback(
    (nextOrder: ColumnId[], nextVisible: Set<ColumnId>) => {
      settingsApi.saveColumnConfig({
        order: nextOrder,
        visible: [...nextVisible],
      }).catch((err) => console.warn("[column-config] persist failed", err));
    },
    DEBOUNCE_MS,
  );

  const setColumnOrder = useCallback(
    (updater: ColumnId[] | ((prev: ColumnId[]) => ColumnId[])) => {
      setOrder((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setVisible((v) => {
          persist(next, v);
          return v;
        });
        return next;
      });
    },
    [persist],
  );

  const toggleColumn = useCallback(
    (id: ColumnId, show: boolean) => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (show) next.add(id);
        else next.delete(id);
        setOrder((o) => {
          const nextOrder = show && !o.includes(id) ? [...o, id] : o;
          persist(nextOrder, next);
          return nextOrder;
        });
        return next;
      });
    },
    [persist],
  );

  const resetTo = useCallback(
    (nextOrder: ColumnId[], nextVisible: ColumnId[]) => {
      const nextOrderSet = new Set(nextOrder);
      const mergedOrder = [
        ...nextOrder.filter((id) => DEFAULT_ORDER.includes(id)),
        ...DEFAULT_ORDER.filter((id) => !nextOrderSet.has(id)),
      ] as ColumnId[];
      const visibleSet = new Set(nextVisible);
      setOrder(mergedOrder);
      setVisible(visibleSet);
      persist(mergedOrder, visibleSet);
    },
    [persist],
  );

  const resetToDefaults = useCallback(() => {
    resetTo(DEFAULT_ORDER, DEFAULT_VISIBLE);
  }, [resetTo]);

  return { order, visible, loaded, setColumnOrder, toggleColumn, resetTo, resetToDefaults };
}
