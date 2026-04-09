"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { POStatus } from "@/types/ticket";
import { SprintSlots } from "@/components/sprint-board/SprintSlots";
import { FilterBar } from "@/components/sprint-board/FilterBar";
import { TicketTable } from "@/components/sprint-board/TicketTable";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { SidePanel } from "@/components/sprint-board/SidePanel";
import { SprintAnalytics } from "@/components/sprint-board/SprintAnalytics";
import { MultiSprintView } from "@/components/sprint-board/MultiSprintView";
import { SearchModal } from "@/components/sprint-board/SearchModal";
import { StoryWriterLauncherModal } from "@/components/sprint-board/StoryWriterLauncherModal";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, bulkReviewStories } from "@/components/sprint-board/sprint-board-utils";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { Columns2, Check, LayoutGrid, CalendarRange, NotebookPen, Search, Bookmark, MoreHorizontal, BarChart2, List } from "lucide-react";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/shared/LoadingState";
import { useColumnWidths } from "@/hooks/useColumnWidths";

export default function SprintBoard() {
  const { data: rawJiraSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawJiraSprints), [rawJiraSprints]);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [slotSprints, setSlotSprints] = useState<string[]>([]);
  const isAllView = searchParams.get("sprint") === "__all__";

  const activeSlot = useMemo(() => {
    const urlSprint = searchParams.get("sprint");
    if (urlSprint === "__all__") return -1;
    if (urlSprint && slotSprints.length > 0) {
      const idx = slotSprints.indexOf(urlSprint);
      if (idx >= 0) return idx;
    }
    const activeIdx = slotSprints.findIndex((id) => sprints.find((s) => s.id === id && s.state === "active"));
    return activeIdx >= 0 ? activeIdx : 0;
  }, [searchParams, slotSprints, sprints]);

  const [ephemeralSprintId, setEphemeralSprintId] = useState<string | null>(null);
  const ephemeralIsActive = !isAllView && ephemeralSprintId !== null && searchParams.get("sprint") === ephemeralSprintId;
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [poPriorityOrder, setPoPriorityOrder] = useLocalStorage<string[] | null>("sprint-board-po-priority", null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [barsCollapsed, setBarsCollapsed] = useLocalStorage("sprint-bars-collapsed", false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  const [compareMode, setCompareMode] = useState(false);
  const [showStoryWriterLauncher, setShowStoryWriterLauncher] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [sprintsModalOpen, setSprintsModalOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotsInitialized = useRef(false);

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const activeSprintId = (isAllView || searchParams.get("view")) ? "__all__" : ephemeralIsActive ? ephemeralSprintId! : slotSprints[activeSlot];
  const { data: apiTickets, isLoading: ticketsLoading, mutate: mutateTickets } = useTickets(activeSprintId || null);
  const allTickets = useMemo(() => apiTickets ?? [], [apiTickets]);

  const { widths: columnWidths, setColumnWidth, resetColumnWidth } = useColumnWidths();
  const f = useSprintBoardFilters(allTickets, poStatuses, isAllView, poPriorityOrder);
  const tickets = f.sortedTickets;

  const activeSprint = isAllView ? null : sprints.find((s) => s.id === activeSprintId);
  const pageTitle = usePageTitle(isAllView ? "Sprint Board - All" : activeSprint ? `${activeSprint.name} - Sprint Board` : "Sprint Board");
  const selected = tickets.find((t) => t.key === selectedTicket);
  const todoCount = allTickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = allTickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = allTickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = allTickets.filter((t) => t.jiraStatus === "DONE").length;
  const totalPoints = allTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const allChecked = checkedTickets.size === tickets.length && tickets.length > 0;
  const someChecked = checkedTickets.size > 0;

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

  useEffect(() => { return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }; }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchModalOpen(true); } }
    function onOpenSearch() { setSearchModalOpen(true); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("valk:openSearch", onOpenSearch);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("valk:openSearch", onOpenSearch); };
  }, []);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headerMenuOpen]);

  const navigateToSprint = useCallback((sprintId: string) => {
    f.resetFilters();
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", sprintId);
    params.delete("view");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [f, searchParams, router]);

  const setActiveSlot = useCallback((slot: number) => {
    const sprintId = slotSprints[slot];
    if (!sprintId) return;
    setEphemeralSprintId(null);
    navigateToSprint(sprintId);
  }, [slotSprints, navigateToSprint]);

  const handleAllClick = useCallback(() => {
    setEphemeralSprintId(null);
    navigateToSprint("__all__");
  }, [navigateToSprint]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedTickets((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedTickets(allChecked ? new Set() : new Set(tickets.map((t) => t.key)));
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

  const handleRangeCheck = useCallback((keys: string[], checked: boolean) => {
    setCheckedTickets((prev) => { const next = new Set(prev); if (checked) keys.forEach((k) => next.add(k)); else keys.forEach((k) => next.delete(k)); return next; });
  }, []);

  const handleBulkSetPoStatus = useCallback(async (status: POStatus) => {
    const keys = [...checkedTickets];
    setPoStatuses((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = status; }); return next; });
    await Promise.all(keys.map((k) => saveTicketMetadata(k, { poStatus: status })));
    showToast(`PO Status set to "${status || "None"}" for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
  }, [checkedTickets, showToast]);

  const handleBulkRefresh = useCallback(async () => {
    setBulkRefreshing(true);
    try {
      await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(slotSprints[activeSlot])}`, { method: "POST" });
      showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`);
    } finally { setBulkRefreshing(false); }
  }, [slotSprints, activeSlot, checkedTickets.size, showToast]);

  const handleBulkReviewStory = useCallback(async () => {
    const keys = Array.from(checkedTickets);
    showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`);
    await bulkReviewStories(keys);
    mutateTickets();
    showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
  }, [checkedTickets, showToast, mutateTickets]);

  const handleCopyToClipboard = useCallback(() => {
    const selected = tickets.filter((t) => checkedTickets.has(t.key));
    const text = selected.map((t) => `- ${t.title} - ${getJiraUrl(t.key)}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${selected.length} ticket${selected.length === 1 ? "" : "s"} to clipboard`);
    }).catch(() => {
      showToast("Failed to copy to clipboard");
    });
  }, [tickets, checkedTickets, showToast]);

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Escape") { setSelectedTicket(null); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.min(prev + 1, tickets.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.max(prev - 1, 0)); }
    else if (e.key === "Enter" && focusedTicketIdx >= 0 && focusedTicketIdx < tickets.length) { e.preventDefault(); const t = tickets[focusedTicketIdx]; setSelectedTicket((prev) => (prev === t.key ? null : t.key)); }
  }, [tickets, focusedTicketIdx]);

  const handleSlotEdit = useCallback((slotIndex: number) => { setEditingSlot((prev) => (prev === slotIndex ? null : slotIndex)); }, []);

  const handleSprintSelect = useCallback((sprintId: string) => {
    if (editingSlot !== null) { setSlotSprints((prev) => { const next = [...prev]; next[editingSlot] = sprintId; saveSprintSlots(next, sprints); return next; }); }
  }, [editingSlot, sprints]);

  const handleSprintListSelect = useCallback((sprintId: string) => {
    setEphemeralSprintId(sprintId);
    navigateToSprint(sprintId);
  }, [navigateToSprint]);

  const handleEphemeralClick = useCallback(() => {
    if (ephemeralSprintId) navigateToSprint(ephemeralSprintId);
  }, [ephemeralSprintId, navigateToSprint]);

  const handleAddSlotWithSprint = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      if (prev.includes(sprintId)) { const next = prev.filter((id) => id !== sprintId); saveSprintSlots(next, sprints); return next; }
      if (prev.length >= 8) return prev;
      const next = [...prev, sprintId]; saveSprintSlots(next, sprints); return next;
    });
  }, [sprints]);

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    saveTicketMetadata(key, { poStatus: status });
  }, []);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(slotSprints[activeSlot])}`, { method: "POST" });
      if (!res.ok) { console.error("Refresh failed:", res.status); showToast("Failed to refresh tickets"); return; }
      const data = await res.json().catch(() => null);
      const count = data?.count ?? 0;
      showToast(`Refreshed ${count} ticket${count === 1 ? "" : "s"}`);
      mutateTickets();
    } finally { setSyncing(false); }
  }, [slotSprints, activeSlot, showToast, mutateTickets]);

  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    setSlotSprints((prev) => {
      const oldIndex = prev.indexOf(activeId); const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev]; next.splice(oldIndex, 1); next.splice(newIndex, 0, activeId); saveSprintSlots(next, sprints); return next;
    });
  }, [sprints]);

  useEffect(() => {
    if (slotsInitialized.current || sprints.length === 0) return;
    slotsInitialized.current = true;
    fetch("/api/sprint-slots")
      .then((r) => r.ok ? r.json() : [])
      .then((savedSlots: { slotIndex: number; sprintId: string }[]) => {
        const sprintIds = new Set(sprints.map((s) => s.id));
        if (Array.isArray(savedSlots) && savedSlots.length > 0) {
          const loaded = savedSlots.sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId).filter((id) => sprintIds.has(id));
          if (loaded.length > 0) { setSlotSprints(loaded); if (loaded.length !== savedSlots.length) saveSprintSlots(loaded, sprints); return; }
        }
        const fb = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fb) setSlotSprints([fb.id]);
      })
      .catch(() => { const fb = sprints.find((s) => s.state === "active") ?? sprints[0]; if (fb) setSlotSprints([fb.id]); });
  }, [sprints]);

  if (compareMode) {
    const leftSprint = slotSprints[activeSlot] ?? slotSprints[0] ?? "";
    const rightSprint = slotSprints.find((_, i) => i !== activeSlot) ?? slotSprints[1] ?? "";
    return <MultiSprintView initialLeft={leftSprint} initialRight={rightSprint} sprints={sprints} onClose={() => setCompareMode(false)} />;
  }

  const sortChange = (fld: typeof f.sortField, d: typeof f.sortDir) => { f.setSortField(fld); f.setSortDir(d); };

  return (
    <>
      {pageTitle}
      <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {(isAllView || activeSprint || f.activeView) && (
          <ViewHeader
            icon={isAllView ? <LayoutGrid size={15} strokeWidth={1.5} className="text-white/30" />
              : f.activeView ? <Bookmark size={15} strokeWidth={1.5} className="text-white/30" fill="currentColor" />
              : <CalendarRange size={15} strokeWidth={1.5} className="text-white/30" />}
            actions={<>
              <Button variant="soft" size="md" icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} onClick={() => setShowStoryWriterLauncher(true)} className="shadow-[0_2px_8px_rgba(46,145,73,0.12)]">
                Story writer
              </Button>
              <Button variant="secondary" size="md" iconOnly icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => setSearchModalOpen(true)} title="Search tickets (⌘K)" />
              <div ref={headerMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => setHeaderMenuOpen((v) => !v)}
                  title="More options"
                  className={headerMenuOpen ? "border-white/[0.12] bg-white/[0.08] text-white/70" : ""}
                />
                {headerMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    <button
                      type="button"
                      onClick={() => { setAnalyticsVisible((v) => !v); setHeaderMenuOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                        analyticsVisible
                          ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                          : "text-white/65 hover:bg-white/[0.06] hover:text-white/85"
                      }`}
                    >
                      <BarChart2 size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Analytics</span>
                    </button>
                    {!isAllView && !f.activeView && (
                      <button
                        type="button"
                        onClick={() => { setCompareMode(true); setHeaderMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150"
                      >
                        <Columns2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Compare</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSprintsModalOpen(true); setHeaderMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150"
                    >
                      <List size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Sprints</span>
                    </button>
                  </div>
                )}
                {sprintsModalOpen && (
                  <SprintListModal
                    onClose={() => setSprintsModalOpen(false)}
                    onSelect={handleSprintListSelect}
                    onPin={handleAddSlotWithSprint}
                    pinnedIds={new Set(slotSprints)}
                  />
                )}
              </div>
            </>}
          >
            <ViewHeaderTitle>
              {isAllView ? "All tickets" : f.activeView ? f.activeView.title : activeSprint!.name}
            </ViewHeaderTitle>
            {!ticketsLoading && (
              <>
                <ViewHeaderDivider />
                <span className="text-xs tabular-nums text-white/30 shrink-0"><span className="text-white/20">Items</span> {f.hasActiveFilters ? `${tickets.length}/${allTickets.length}` : allTickets.length}</span>
                {!isAllView && !f.activeView && totalPoints > 0 && <span className="text-xs tabular-nums text-white/30 shrink-0"><span className="text-white/20">Pts</span> {totalPoints}</span>}
                {!isAllView && !f.activeView && (
                  <>
                    <ViewHeaderDivider />
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      {([
                        { status: "TO DO", count: todoCount, bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8" },
                        { status: "IN PROGRESS", count: inProgressCount, bg: "rgba(56, 152, 210, 0.15)", text: "#58b4e6" },
                        ...(testCount > 0 ? [{ status: "TEST", count: testCount, bg: "rgba(120, 90, 220, 0.15)", text: "#9b7ee8" }] : []),
                        { status: "DONE", count: doneCount, bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
                      ] as const).map(({ status, count, bg, text }) => {
                        const active = f.statusFilter.has(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              const next = new Set(f.statusFilter);
                              if (active) next.delete(status); else next.add(status);
                              f.setStatusFilter(next);
                            }}
                            className="inline-flex items-center rounded px-1.5 py-0.5 cursor-pointer transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                            style={{ backgroundColor: bg, color: text, opacity: f.statusFilter.size > 0 && !active ? 0.4 : 1 }}
                          >
                            {status}: {count}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </ViewHeader>
        )}

        <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} />

        {!barsCollapsed && (
          <>
            <div className="border-b border-white/[0.06]">
              <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} poStatusFilter={f.poStatusFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onPoStatusFilterChange={f.setPoStatusFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} {... (isAllView ? { sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
            </div>
            {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} />}
          </>
        )}

        {ticketsLoading && (
          <LoadingState variant="spinner" label="Loading tickets..." />
        )}

        {!ticketsLoading && <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} hoveredRow={hoveredRow} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={f.visibleColumns} showSprintColumn={isAllView || !!f.activeViewId} sprintNameMap={sprintNameMap} poStatuses={poStatuses} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onHoverRow={setHoveredRow} onLeaveRow={() => setHoveredRow(null)} onPoStatusChange={handlePoStatusChange} onTableKeyDown={handleTableKeyDown} onReorder={handleReorder} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} onColumnToggle={f.handleColumnToggle} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} />}

        {someChecked && <BulkActionBar count={checkedTickets.size} onClear={() => setCheckedTickets(new Set())} onSetPoStatus={handleBulkSetPoStatus} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} isRefreshing={bulkRefreshing} />}
      </div>

      {selected && <SidePanel ticket={selected} poStatus={poStatuses[selected.key] ?? null} onPoStatusChange={(v) => handlePoStatusChange(selected.key, v)} onNotesChange={(notes) => { saveTicketMetadata(selected.key, { poNotes: notes }); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} />}

      {toast && (
        <div role="status" className="pointer-events-none fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" style={{ animation: "fadeInUp 0.2s ease-out" }}>
          <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />
          <span className="text-sm text-white/70">{toast}</span>
        </div>
      )}
      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      <StoryWriterLauncherModal open={showStoryWriterLauncher} onClose={() => setShowStoryWriterLauncher(false)} />
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
    </>
  );
}
