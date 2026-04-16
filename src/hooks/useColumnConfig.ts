"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ColumnId } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE, COLUMNS } from "@/components/sprint-board/FilterBar";

const DEBOUNCE_MS = 500;

const DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);

export function useColumnConfig() {
  const [order, setOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings/column-config")
      .then((r) => (r.ok ? r.json() : { order: null, visible: null }))
      .then((data: { order: string[] | null; visible: string[] | null }) => {
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

  const persist = useCallback(
    (nextOrder: ColumnId[], nextVisible: Set<ColumnId>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/settings/column-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: nextOrder,
            visible: [...nextVisible],
          }),
        }).catch((err) => console.warn("[column-config] persist failed", err));
      }, DEBOUNCE_MS);
    },
    [],
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
          // If enabling a column not yet in order, append it so it becomes visible in the table
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
      // Always merge: keep provided order, append any DEFAULT_ORDER columns not yet present
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return { order, visible, loaded, setColumnOrder, toggleColumn, resetTo, resetToDefaults };
}
