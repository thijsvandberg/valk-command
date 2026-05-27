"use client";

import { useState, useEffect, useCallback } from "react";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE, COLUMNS } from "@/components/sprint-board/FilterBar";
import { settings as settingsApi } from "@/lib/api-client";
import { useDebouncedCallback } from "./useDebouncedCallback";

const DEBOUNCE_MS = 500;

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);

export function useColumnConfig() {
  const [order, setOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    settingsApi.getColumnConfig()
      .then((raw) => raw as { order: string[] | null; visible: string[] | null })
      .then((data) => {
        if (data.order && data.order.length > 0) {
          // Merge: keep saved order, append any new columns not yet in the saved order
          const savedSet = new Set(data.order);
          const merged = [
            ...data.order.filter((id) => DEFAULT_ORDER.includes(id as ColumnId)),
            ...DEFAULT_ORDER.filter((id) => !savedSet.has(id)),
          ] as ColumnId[];
          setOrder(merged);
        }
        if (data.visible && data.visible.length > 0) {
          setVisible(new Set(data.visible as ColumnId[]));
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
