"use client";

import { useState, useCallback, useEffect } from "react";

interface UseMultiselectReturn {
  active: boolean;
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  deselectAll: () => void;
  activate: () => void;
  deactivate: () => void;
}

export function useMultiselect(): UseMultiselectReturn {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const activate = useCallback(() => {
    setActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set());
  }, []);

  // Escape key exits multiselect mode
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActive(false);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return {
    active,
    selectedIds,
    toggle,
    selectAll,
    deselectAll,
    activate,
    deactivate,
  };
}
