"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Ticket, POStatus, Sprint } from "@/types/ticket";
import { SprintSlots } from "./SprintSlots";
import { FilterBar, type SortField, type SortDir, type ColumnId, DEFAULT_VISIBLE } from "./FilterBar";
import { TicketTable } from "./TicketTable";
import { BulkActionBar } from "./BulkActionBar";
import { SidePanel } from "./SidePanel";
import { SprintAnalytics } from "./SprintAnalytics";
import { MultiSprintView } from "./MultiSprintView";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";

function mapJiraSprints(raw: { id: number; name: string; state: string; startDate: string | null; endDate: string | null }[] | undefined): Sprint[] {
  if (!raw) return [];
  return raw.map((s) => {
    let dateRange = "";
    if (s.startDate && s.endDate) {
      const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      dateRange = `${fmt(s.startDate)} - ${fmt(s.endDate)}`;
    }
    const state = s.state === "active" ? "active" as const
      : s.state === "closed" ? "closed" as const
      : "future" as const;
    return { id: String(s.id), name: s.name, dateRange, state, ticketCount: 0 };
  });
}
import { Columns2, Check, Loader2 } from "lucide-react";
import { mutate as globalMutate } from "swr";

// Persist sprint slot configuration to the API and SWR cache
async function saveSprintSlots(slotSprints: string[], sprints: Sprint[]) {
  const slots = slotSprints.map((sprintId, idx) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    return {
      slotIndex: idx,
      sprintId,
      sprintName: sprint?.name ?? sprintId,
    };
  });

  // Keep SWR cache in sync so stale data never overwrites state
  globalMutate("/api/sprint-slots", slots, false);

  try {
    await fetch("/api/sprint-slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slots),
    });
  } catch (err) {
    console.error("Failed to save sprint slots:", err);
  }
}

// Persist PO metadata changes to the API
async function saveTicketMetadata(
  jiraKey: string,
  updates: { poStatus?: POStatus | undefined; poNotes?: string | undefined },
) {
  try {
    await fetch(`/api/tickets/${encodeURIComponent(jiraKey)}/metadata`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.error("Failed to save ticket metadata:", err);
  }
}

// ============================================================
// Main SprintBoard component
// ============================================================

export default function SprintBoard() {
  const { data: rawJiraSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawJiraSprints), [rawJiraSprints]);

  const searchParams = useSearchParams();
  const router = useRouter();

  const [slotSprints, setSlotSprints] = useState<string[]>([]);
  // Derive active slot from URL, falling back to the first active sprint
  const activeSlot = useMemo(() => {
    const urlSprint = searchParams.get("sprint");
    if (urlSprint && slotSprints.length > 0) {
      const idx = slotSprints.indexOf(urlSprint);
      if (idx >= 0) return idx;
    }
    // No URL param: prefer the first pinned sprint with state "active"
    const activeIdx = slotSprints.findIndex((id) =>
      sprints.find((s) => s.id === id && s.state === "active"),
    );
    return activeIdx >= 0 ? activeIdx : 0;
  }, [searchParams, slotSprints, sprints]);

  const setActiveSlot = useCallback((slot: number) => {
    const sprintId = slotSprints[slot];
    if (!sprintId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", sprintId);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [slotSprints, searchParams, router]);

  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [storedColumns, setStoredColumns] = useLocalStorage<ColumnId[]>("sprint-board-columns", [...DEFAULT_VISIBLE]);
  const visibleColumns = useMemo(() => new Set(storedColumns), [storedColumns]);
  const setVisibleColumns = useCallback((updater: (prev: Set<ColumnId>) => Set<ColumnId>) => {
    setStoredColumns((prev) => [...updater(new Set(prev))]);
  }, [setStoredColumns]);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  // PO priority order: stored in localStorage, independent from Jira rank
  const [poPriorityOrder, setPoPriorityOrder] = useLocalStorage<string[] | null>("sprint-board-po-priority", null);

  const [compareMode, setCompareMode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Filter state (restored from localStorage)
  interface StoredFilters { status: string[]; epic: string[]; assignee: string[]; poStatus: string[] }
  const defaultFilters: StoredFilters = { status: [], epic: [], assignee: [], poStatus: [] };
  const [storedFilters, setStoredFilters] = useLocalStorage<StoredFilters>("sprint-board-filters", defaultFilters);
  const statusFilter = useMemo(() => new Set(storedFilters.status), [storedFilters.status]);
  const epicFilter = useMemo(() => new Set(storedFilters.epic), [storedFilters.epic]);
  const assigneeFilter = useMemo(() => new Set(storedFilters.assignee), [storedFilters.assignee]);
  const poStatusFilter = useMemo(() => new Set(storedFilters.poStatus), [storedFilters.poStatus]);
  const setStatusFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, status: [...v] }));
  }, [setStoredFilters]);
  const setEpicFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, epic: [...v] }));
  }, [setStoredFilters]);
  const setAssigneeFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, assignee: [...v] }));
  }, [setStoredFilters]);
  const setPoStatusFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, poStatus: [...v] }));
  }, [setStoredFilters]);

  // Sort state (restored from localStorage)
  interface StoredSort { field: SortField; direction: SortDir }
  const [storedSort, setStoredSort] = useLocalStorage<StoredSort>("sprint-board-sort", { field: "rank", direction: "asc" });
  const sortField = storedSort.field;
  const sortDir = storedSort.direction;
  const setSortField = useCallback((f: SortField) => {
    setStoredSort((prev) => ({ ...prev, field: f }));
  }, [setStoredSort]);
  const setSortDir = useCallback((d: SortDir) => {
    setStoredSort((prev) => ({ ...prev, direction: d }));
  }, [setStoredSort]);

  // Persistence is handled automatically by useLocalStorage

  const activeSprintId = slotSprints[activeSlot];
  const slotsInitialized = useRef(false);

  const activeSprint = sprints.find((s) => s.id === activeSprintId);
  const { data: apiTickets, isLoading: ticketsLoading, mutate: mutateTickets } = useTickets(activeSprintId || null);
  const allTickets = useMemo(() => apiTickets ?? [], [apiTickets]);

  useEffect(() => {
    if (apiTickets && apiTickets.length > 0) {
      setPoStatuses((prev) => {
        let changed = false;
        const next = { ...prev };
        apiTickets.forEach((t) => { if (!(t.key in next)) { next[t.key] = t.poStatus; changed = true; } });
        return changed ? next : prev;
      });
    }
  }, [apiTickets]);

  // Derive unique filter options from the ticket data
  const statusOptions = useMemo(() => [...new Set(allTickets.map((t) => t.jiraStatus))], [allTickets]);
  const epicOptions = useMemo(() => [...new Set(allTickets.map((t) => t.epic).filter(Boolean) as string[])], [allTickets]);
  const assigneeOptions = useMemo(() => [...new Set(allTickets.map((t) => t.assignee?.name).filter(Boolean) as string[])], [allTickets]);

  // Apply filters
  const filteredTickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (statusFilter.size > 0 && !statusFilter.has(t.jiraStatus)) return false;
      if (epicFilter.size > 0 && (!t.epic || !epicFilter.has(t.epic))) return false;
      if (assigneeFilter.size > 0) {
        const name = t.assignee?.name;
        if (!name || !assigneeFilter.has(name)) return false;
      }
      if (poStatusFilter.size > 0) {
        const current = poStatuses[t.key] ?? null;
        if (!current || !poStatusFilter.has(current)) return false;
      }
      return true;
    });
  }, [allTickets, statusFilter, epicFilter, assigneeFilter, poStatusFilter, poStatuses]);

  // Apply sort (PO priority order takes precedence when sorting by rank)
  const tickets = useMemo(() => {
    if (sortField === "rank") {
      if (poPriorityOrder && poPriorityOrder.length > 0) {
        const orderMap = new Map(poPriorityOrder.map((key, idx) => [key, idx]));
        const sorted = [...filteredTickets];
        sorted.sort((a, b) => {
          const aIdx = orderMap.get(a.key) ?? Infinity;
          const bIdx = orderMap.get(b.key) ?? Infinity;
          return aIdx - bIdx;
        });
        return sorted;
      }
      return filteredTickets;
    }
    const sorted = [...filteredTickets];
    const dir = sortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortField) {
        case "quality": {
          const aScore = a.qualityScore ?? -1;
          const bScore = b.qualityScore ?? -1;
          return (aScore - bScore) * dir;
        }
        case "points": {
          const aPts = a.storyPoints ?? -1;
          const bPts = b.storyPoints ?? -1;
          return (aPts - bPts) * dir;
        }
        case "key": {
          return a.key.localeCompare(b.key) * dir;
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [filteredTickets, sortField, sortDir, poPriorityOrder]);

  const selected = tickets.find((t) => t.key === selectedTicket);

  // Stats are based on all tickets (unfiltered) for the sprint header
  const todoCount = allTickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = allTickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = allTickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = allTickets.filter((t) => t.jiraStatus === "DONE").length;
  const totalPoints = allTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  const hasActiveFilters = statusFilter.size > 0 || epicFilter.size > 0 || assigneeFilter.size > 0 || poStatusFilter.size > 0;

  const allChecked = checkedTickets.size === tickets.length && tickets.length > 0;
  const someChecked = checkedTickets.size > 0;

  const toggleCheck = useCallback((key: string) => {
    setCheckedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allChecked) {
      setCheckedTickets(new Set());
    } else {
      setCheckedTickets(new Set(tickets.map((t) => t.key)));
    }
  }, [allChecked, tickets]);

  const handleReorder = useCallback((activeKey: string, overKey: string) => {
    const currentOrder = poPriorityOrder ?? tickets.map((t) => t.key);
    const oldIndex = currentOrder.indexOf(activeKey);
    const newIndex = currentOrder.indexOf(overKey);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, activeKey);

    setPoPriorityOrder(newOrder);
  }, [poPriorityOrder, tickets, setPoPriorityOrder]);

  const handleBulkSetPoStatus = useCallback(async (status: POStatus) => {
    const keys = [...checkedTickets];
    setPoStatuses((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = status; });
      return next;
    });
    await Promise.all(keys.map((k) => saveTicketMetadata(k, { poStatus: status })));
    showToast(`PO Status set to "${status || "None"}" for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
  }, [checkedTickets, showToast]);

  const handleBulkRefresh = useCallback(async () => {
    setBulkRefreshing(true);
    try {
      const currentSprintId = slotSprints[activeSlot];
      await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(currentSprintId)}`, { method: "POST" });
      showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`);
    } finally {
      setBulkRefreshing(false);
    }
  }, [slotSprints, activeSlot, checkedTickets.size, showToast]);

  // Bulk review submits each ticket as a workspace task sequentially
  const handleBulkReviewStory = useCallback(async () => {
    const keys = Array.from(checkedTickets);
    showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`);

    for (const key of keys) {
      try {
        // Submit workspace task and wait for completion via polling
        const taskRes = await fetch("/api/workspace-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill: "review-story-json", args: { args: key } }),
        });
        if (!taskRes.ok) continue;

        const task = await taskRes.json();
        // Poll for result (simple approach for bulk)
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await fetch(`/api/workspace-tasks/${task.id}`);
          if (!statusRes.ok) break;
          const statusData = await statusRes.json();
          if (statusData.status === "completed" && statusData.output) {
            const { parseReviewOutput, mapAgentReviewToResult } = await import("@/lib/agent-client");
            const agentData = parseReviewOutput(statusData.output);
            if (agentData) {
              const result = mapAgentReviewToResult(agentData);
              await fetch(`/api/tickets/${encodeURIComponent(key)}/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source: "bulk-action",
                  overallScore: result.overallScore,
                  dimensions: result.dimensions,
                  summary: result.summary,
                  suggestions: result.suggestions,
                }),
              });
            }
            break;
          }
          if (statusData.status === "failed") break;
          attempts++;
        }
      } catch {
        // Individual review failures shouldn't stop the batch
      }
    }

    mutateTickets();
    showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
  }, [checkedTickets, showToast, mutateTickets]);

  // Keyboard navigation: arrow keys, Enter, Escape
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Escape") {
      setSelectedTicket(null);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedTicketIdx((prev) => Math.min(prev + 1, tickets.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedTicketIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && focusedTicketIdx >= 0 && focusedTicketIdx < tickets.length) {
      e.preventDefault();
      const t = tickets[focusedTicketIdx];
      setSelectedTicket((prev) => (prev === t.key ? null : t.key));
    }
  }, [tickets, focusedTicketIdx]);

  const handleColumnToggle = useCallback((id: ColumnId, show: boolean) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [setVisibleColumns]);

  const handleSlotEdit = useCallback((slotIndex: number) => {
    setEditingSlot((prev) => (prev === slotIndex ? null : slotIndex));
  }, []);

  const handleSprintSelect = useCallback(
    (sprintId: string) => {
      if (editingSlot !== null) {
        setSlotSprints((prev) => {
          const next = [...prev];
          next[editingSlot] = sprintId;
          saveSprintSlots(next, sprints);
          return next;
        });
      }
    },
    [editingSlot, sprints]
  );

  const handleSprintListSelect = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      const next = [...prev];
      next[activeSlot] = sprintId;
      saveSprintSlots(next, sprints);
      return next;
    });
  }, [activeSlot, sprints]);

  const handleAddSlotWithSprint = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      // If already pinned, remove it
      if (prev.includes(sprintId)) {
        const next = prev.filter((id) => id !== sprintId);
        saveSprintSlots(next, sprints);
        return next;
      }
      // Add as new slot (max 4)
      if (prev.length >= 4) return prev;
      const next = [...prev, sprintId];
      saveSprintSlots(next, sprints);
      return next;
    });
  }, [sprints]);

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    saveTicketMetadata(key, { poStatus: status });
  }, []);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      const currentSprintId = slotSprints[activeSlot];
      const res = await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(currentSprintId)}`, { method: "POST" });
      if (!res.ok) {
        console.error("Refresh failed:", res.status);
        showToast("Failed to refresh tickets");
        return;
      }
      const data = await res.json().catch(() => null);
      const count = data?.count ?? 0;
      showToast(`Refreshed ${count} ticket${count === 1 ? "" : "s"}`);
      mutateTickets();
    } finally {
      setSyncing(false);
    }
  }, [slotSprints, activeSlot, showToast, mutateTickets]);

  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    setSlotSprints((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, activeId);
      saveSprintSlots(next, sprints);
      // activeSlot is derived from URL, so it auto-adjusts to the new array order
      return next;
    });
  }, [sprints]);

  // Load saved sprint slots directly from API on mount, bypassing SWR cache
  // to avoid stale cache data after client-side navigation.
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
            if (loaded.length !== savedSlots.length) {
              saveSprintSlots(loaded, sprints);
            }
            return;
          }
        }

        // Fallback: pick active sprint or first available
        const fallback = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fallback) setSlotSprints([fallback.id]);
      })
      .catch(() => {
        const fallback = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fallback) setSlotSprints([fallback.id]);
      });
  }, [sprints]);

  // Compare mode: show multi-sprint view
  if (compareMode) {
    const leftSprint = slotSprints[activeSlot] ?? slotSprints[0] ?? "";
    const rightSprint = slotSprints.find((_, i) => i !== activeSlot) ?? slotSprints[1] ?? "";
    return (
      <MultiSprintView
        initialLeft={leftSprint}
        initialRight={rightSprint}
        sprints={sprints}
        onClose={() => setCompareMode(false)}
      />
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sprint Slots */}
        <SprintSlots
          slotSprints={slotSprints}
          activeSlot={activeSlot}
          sprints={sprints}
          onSlotClick={setActiveSlot}
          editingSlot={editingSlot}
          onSlotEdit={handleSlotEdit}
          onSprintSelect={handleSprintSelect}
          onEditClose={() => setEditingSlot(null)}
          syncing={syncing}
          onRefresh={handleRefresh}
          onSprintListSelect={handleSprintListSelect}
          onAddSlotWithSprint={handleAddSlotWithSprint}
          onReorderSlots={handleReorderSlots}
        />

        {/* Filter bar */}
        <FilterBar
          statusFilter={statusFilter}
          epicFilter={epicFilter}
          assigneeFilter={assigneeFilter}
          poStatusFilter={poStatusFilter}
          onStatusFilterChange={setStatusFilter}
          onEpicFilterChange={setEpicFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          onPoStatusFilterChange={setPoStatusFilter}
          statusOptions={statusOptions}
          epicOptions={epicOptions}
          assigneeOptions={assigneeOptions}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={(f, d) => { setSortField(f); setSortDir(d); }}
          visibleColumns={visibleColumns}
          onColumnToggle={handleColumnToggle}
        />

        {/* Sprint header */}
        {activeSprint && (
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="font-[var(--font-display)] text-sm font-semibold text-white">
              {activeSprint.name}
            </span>
            {activeSprint.dateRange && (
              <span className="text-xs text-white/30">{activeSprint.dateRange}</span>
            )}
            <span className="text-xs text-white/30">
              {hasActiveFilters ? `${tickets.length} / ${allTickets.length} items` : `${allTickets.length} items`}
            </span>
            {totalPoints > 0 && (
              <span className="text-xs text-white/30">{totalPoints} pts</span>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 tabular-nums text-white/40">
                {todoCount}
              </span>
              <span className="rounded bg-[rgba(46,145,73,0.12)] px-1.5 py-0.5 tabular-nums text-[#4aaa60]">
                {inProgressCount}
              </span>
              {testCount > 0 && (
                <span className="rounded bg-[rgba(234,179,8,0.12)] px-1.5 py-0.5 tabular-nums text-[#eab308]">
                  {testCount}
                </span>
              )}
              <span className="rounded bg-[rgba(46,145,73,0.2)] px-1.5 py-0.5 tabular-nums text-[#2e9149]">
                {doneCount}
              </span>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setCompareMode(true)}
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-xs text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
            >
              <Columns2 className="h-3 w-3" strokeWidth={1.5} />
              Compare
            </button>
          </div>
        )}

        {/* Sprint analytics */}
        {!ticketsLoading && <SprintAnalytics tickets={allTickets} />}

        {ticketsLoading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} strokeWidth={2} className="animate-spin text-white/20" />
              <span className="text-sm text-white/30">Loading tickets...</span>
            </div>
          </div>
        )}

        {!ticketsLoading && <TicketTable
          tickets={tickets}
          checkedTickets={checkedTickets}
          selectedTicket={selectedTicket}
          hoveredRow={hoveredRow}
          focusedTicketIdx={focusedTicketIdx}
          someChecked={someChecked}
          allChecked={allChecked}
          visibleColumns={visibleColumns}
          poStatuses={poStatuses}
          onToggleCheck={toggleCheck}
          onToggleAll={toggleAll}
          onSelectTicket={setSelectedTicket}
          onHoverRow={setHoveredRow}
          onLeaveRow={() => setHoveredRow(null)}
          onPoStatusChange={handlePoStatusChange}
          onTableKeyDown={handleTableKeyDown}
          onReorder={handleReorder}
        />}

        {/* Bulk action bar */}
        {someChecked && (
          <BulkActionBar
            count={checkedTickets.size}
            onClear={() => setCheckedTickets(new Set())}
            onSetPoStatus={handleBulkSetPoStatus}
            onRefreshFromJira={handleBulkRefresh}
            onReviewStory={handleBulkReviewStory}
            isRefreshing={bulkRefreshing}
          />
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <SidePanel
          ticket={selected}
          poStatus={poStatuses[selected.key] ?? null}
          onPoStatusChange={(v) => handlePoStatusChange(selected.key, v)}
          onNotesChange={(notes) => {
            saveTicketMetadata(selected.key, { poNotes: notes });
          }}
          onClose={() => setSelectedTicket(null)}
          onShowToast={showToast}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          style={{
            animation: "fadeInUp 0.2s ease-out",
          }}
        >
          <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />
          <span className="text-sm text-white/70">{toast}</span>
        </div>
      )}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
