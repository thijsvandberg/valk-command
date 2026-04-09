"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Sprint } from "@/types/ticket";
import type { SavedView, SortField, SortDir } from "@/components/sprint-board/FilterBar";
import { saveSprintSlots } from "@/components/sprint-board/sprint-board-utils";
import type { StoredFilters, StoredSort } from "@/components/sprint-board/useSprintBoardFilters";

interface NavigationDeps {
  sprints: Sprint[];
  setStoredFilters: (v: StoredFilters | ((prev: StoredFilters) => StoredFilters)) => void;
  setStoredSort: (v: StoredSort | ((prev: StoredSort) => StoredSort)) => void;
  setSavedViews: (v: SavedView[] | ((prev: SavedView[]) => SavedView[])) => void;
  savedViews: SavedView[];
  activeViewId: string | null;
  currentFiltersSnapshot: () => { status: string[]; epic: string[]; assignee: string[]; poStatus: string[]; editState: string[] };
  sortField: SortField;
  sortDir: SortDir;
}

const emptyFilters: StoredFilters = { status: [], epic: [], assignee: [], poStatus: [], editState: [] };

export function useSprintBoardNavigation(deps: NavigationDeps) {
  const { sprints, setStoredFilters, setStoredSort, setSavedViews, savedViews, activeViewId, currentFiltersSnapshot, sortField, sortDir } = deps;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [slotSprints, setSlotSprints] = useState<string[]>([]);
  const [ephemeralSprintId, setEphemeralSprintId] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const slotsInitialized = useRef(false);

  const isAllView = searchParams.get("sprint") === "__all__";
  const ephemeralIsActive = !isAllView && ephemeralSprintId !== null && searchParams.get("sprint") === ephemeralSprintId;

  const activeSlot = (() => {
    const urlSprint = searchParams.get("sprint");
    if (urlSprint === "__all__") return -1;
    if (urlSprint && slotSprints.length > 0) {
      const idx = slotSprints.indexOf(urlSprint);
      if (idx >= 0) return idx;
    }
    const activeIdx = slotSprints.findIndex((id) =>
      sprints.find((s) => s.id === id && s.state === "active"),
    );
    return activeIdx >= 0 ? activeIdx : 0;
  })();

  const replaceParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const setActiveSlot = useCallback((slot: number) => {
    const sprintId = slotSprints[slot];
    if (!sprintId) return;
    setEphemeralSprintId(null);
    setStoredFilters(emptyFilters);
    replaceParams({ sprint: sprintId, view: null });
  }, [slotSprints, setStoredFilters, replaceParams]);

  const handleAllClick = useCallback(() => {
    setEphemeralSprintId(null);
    setStoredFilters(emptyFilters);
    replaceParams({ sprint: "__all__", view: null });
  }, [setStoredFilters, replaceParams]);

  const handleSprintListSelect = useCallback((sprintId: string) => {
    setEphemeralSprintId(sprintId);
    setStoredFilters(emptyFilters);
    replaceParams({ sprint: sprintId, view: null });
  }, [setStoredFilters, replaceParams]);

  const handleEphemeralClick = useCallback(() => {
    if (!ephemeralSprintId) return;
    setStoredFilters(emptyFilters);
    replaceParams({ sprint: ephemeralSprintId, view: null });
  }, [ephemeralSprintId, setStoredFilters, replaceParams]);

  const handleSlotEdit = useCallback((slotIndex: number) => {
    setEditingSlot((prev) => (prev === slotIndex ? null : slotIndex));
  }, []);

  const handleSprintSelect = useCallback((sprintId: string) => {
    if (editingSlot !== null) {
      setSlotSprints((prev) => {
        const next = [...prev];
        next[editingSlot] = sprintId;
        saveSprintSlots(next, sprints);
        return next;
      });
    }
  }, [editingSlot, sprints]);

  const handleAddSlotWithSprint = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      if (prev.includes(sprintId)) {
        const next = prev.filter((id) => id !== sprintId);
        saveSprintSlots(next, sprints);
        return next;
      }
      if (prev.length >= 8) return prev;
      const next = [...prev, sprintId];
      saveSprintSlots(next, sprints);
      return next;
    });
  }, [sprints]);

  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    setSlotSprints((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, activeId);
      saveSprintSlots(next, sprints);
      return next;
    });
  }, [sprints]);

  const handleSaveView = useCallback((title: string) => {
    if (activeViewId) {
      setSavedViews((prev) => prev.map((v) =>
        v.id === activeViewId
          ? { ...v, title, filters: currentFiltersSnapshot(), sort: { field: sortField, direction: sortDir } }
          : v
      ));
    } else {
      const id = crypto.randomUUID();
      const view = { id, title, filters: currentFiltersSnapshot(), sort: { field: sortField, direction: sortDir } };
      setSavedViews((prev) => [...prev, view]);
      replaceParams({ view: id });
    }
  }, [activeViewId, setSavedViews, currentFiltersSnapshot, sortField, sortDir, replaceParams]);

  const handleViewClick = useCallback((view: SavedView) => {
    setStoredFilters({
      status: view.filters.status,
      epic: view.filters.epic,
      assignee: view.filters.assignee,
      poStatus: view.filters.poStatus,
      editState: view.filters.editState ?? [],
    });
    setStoredSort({ field: view.sort.field as SortField, direction: view.sort.direction as SortDir });
    replaceParams({ view: view.id, sprint: null });
  }, [setStoredFilters, setStoredSort, replaceParams]);

  const handleDeleteView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) {
      replaceParams({ view: null });
    }
  }, [setSavedViews, activeViewId, replaceParams]);

  useEffect(() => {
    if (slotsInitialized.current) return;
    if (sprints.length === 0) return;
    slotsInitialized.current = true;

    fetch("/api/sprint-slots")
      .then((r) => r.ok ? r.json() : [])
      .then((savedSlots: { slotIndex: number; sprintId: string }[]) => {
        const sprintIds = new Set(sprints.map((s) => s.id));
        if (Array.isArray(savedSlots) && savedSlots.length > 0) {
          const loaded = savedSlots
            .sort((a, b) => a.slotIndex - b.slotIndex)
            .map((s) => s.sprintId)
            .filter((id) => sprintIds.has(id));
          if (loaded.length > 0) {
            setSlotSprints(loaded);
            if (loaded.length !== savedSlots.length) saveSprintSlots(loaded, sprints);
            return;
          }
        }
        const fallback = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fallback) setSlotSprints([fallback.id]);
      })
      .catch(() => {
        const fallback = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fallback) setSlotSprints([fallback.id]);
      });
  }, [sprints]);

  return {
    slotSprints,
    activeSlot,
    isAllView,
    ephemeralSprintId,
    ephemeralIsActive,
    editingSlot,
    setActiveSlot,
    handleAllClick,
    handleSprintListSelect,
    handleEphemeralClick,
    handleSlotEdit,
    handleSprintSelect,
    handleAddSlotWithSprint,
    handleReorderSlots,
    handleSaveView,
    handleViewClick,
    handleDeleteView,
  };
}
